import { type NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getProviderFor } from "@/lib/data";
import { sendViaGmail } from "@/lib/email";
import { recordEmailTestResult, saveGmailSender } from "@/lib/email/config";
import { emailTestEmail } from "@/lib/email/templates";
import { googleSignInEnabled } from "@/lib/google/config";
import { decodeIdToken, exchangeCode, OAUTH_STATE_COOKIE } from "@/lib/google/oauth";
import { appUrl } from "@/lib/utils/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

/**
 * Gmail connect callback — the one mutating step of the flow, and only ever
 * reached via Google's redirect after the owner consented.
 *
 *   exchange code → learn which mailbox granted it (id_token, else userinfo)
 *   → check gmail.send was actually granted → encrypt + store the refresh
 *   token as this workspace's sender → send a REAL test email to that mailbox
 *   → record the result → back to Settings → Channels with an honest status.
 *
 * Nothing here claims "connected" on an untested grant: `verifiedAt` is only
 * set by that test send succeeding.
 */
export async function GET(req: NextRequest) {
  const origin = await appUrl();

  const done = (search = "") => {
    const res = NextResponse.redirect(new URL(`/app/settings/channels${search}`, origin));
    res.cookies.delete(OAUTH_STATE_COOKIE);
    return res;
  };

  const session = await getSession();
  if (!session) {
    const res = NextResponse.redirect(new URL("/sign-in", origin));
    res.cookies.delete(OAUTH_STATE_COOKIE);
    return res;
  }
  if (session.role !== "owner" && session.role !== "manager") return done("?error=forbidden");
  if (!googleSignInEnabled()) return done("?error=google_not_configured");

  const ws = session.workspaceId;
  const params = req.nextUrl.searchParams;
  if (params.get("error")) {
    // Cancelled on Google's consent screen — not a fault on our side.
    return done("?error=gmail_cancelled");
  }

  const code = params.get("code");
  const state = params.get("state");
  const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return done("?error=gmail_state");
  }

  const tokens = await exchangeCode({
    code,
    redirectUri: `${origin}/api/google/gmail/connect/callback`,
  });
  if (!tokens) return done("?error=gmail_exchange");

  // Google grants scopes individually; the owner can untick gmail.send on
  // the consent screen. Read what was granted rather than assuming.
  const scopes = tokens.scope ?? "";
  if (!scopes.split(/\s+/).includes(GMAIL_SEND_SCOPE)) {
    return done("?error=gmail_scope");
  }
  // Only the first offline consent returns a refresh token; the connect route
  // forces prompt=consent precisely so we get one every time.
  if (!tokens.refresh_token) return done("?error=gmail_offline_access");

  const mailbox = await resolveMailbox(tokens.id_token, tokens.access_token);
  if (!mailbox) return done("?error=gmail_identity");

  // From = "<Business name> <mailbox>". The location name is what customers
  // recognise; the workspace name is the fallback for a not-yet-onboarded one.
  const provider = await getProviderFor(session);
  const data = await provider.getData(ws);
  const businessName = data?.location.name?.trim() || data?.workspace.name?.trim() || undefined;

  const saved = await saveGmailSender(ws, {
    refreshToken: tokens.refresh_token,
    googleAccount: mailbox,
    scopes,
    fromName: businessName,
  });
  if (!saved.ok) return done(`?error=gmail_save&detail=${encodeURIComponent(saved.reason.slice(0, 160))}`);

  // Real test send through the backend we just enabled, against the config we
  // just wrote — no resolver round trip, so a stale request-scoped read can't
  // test the previous sender by mistake.
  const template = emailTestEmail();
  const result = await sendViaGmail(
    {
      provider: "gmail",
      secret: tokens.refresh_token,
      fromEmail: mailbox,
      fromName: businessName,
      googleAccount: mailbox,
      status: null,
      source: "workspace",
    },
    {
      to: mailbox,
      subject: template.subject,
      html: template.html,
      text: template.text,
      workspaceId: ws,
    },
  );
  await recordEmailTestResult(ws, {
    ok: result.ok,
    detail: result.ok ? undefined : (result.detail ?? result.reason),
  });

  revalidatePath("/app/settings", "layout");
  revalidatePath("/", "layout");

  return done(result.ok ? "?gmail=connected" : "?gmail=test_failed");
}

/**
 * The mailbox that granted access. The verified id_token is authoritative;
 * userinfo is the fallback when Google omits it (it shouldn't with `openid
 * email`, but a missing address must fail loudly, not store a blank From).
 */
async function resolveMailbox(idToken: string | undefined, accessToken: string): Promise<string | null> {
  if (idToken) {
    const identity = await decodeIdToken(idToken);
    if (identity?.email) return identity.email;
  }
  try {
    const res = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: unknown };
    return typeof data.email === "string" && data.email.includes("@")
      ? data.email.trim().toLowerCase()
      : null;
  } catch {
    return null;
  }
}
