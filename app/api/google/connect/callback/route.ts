import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getProviderFor } from "@/lib/data";
import { googleSignInEnabled } from "@/lib/google/config";
import { encryptSecret } from "@/lib/google/crypto";
import { listAccounts } from "@/lib/google/gbp";
import { exchangeCode, OAUTH_STATE_COOKIE } from "@/lib/google/oauth";
import { appUrl } from "@/lib/utils/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GBP connect callback — approval-aware and honest. After the token
 * exchange we probe the GBP Account Management API once:
 *   ok            → "connected"
 *   not_approved  → "needs_attention" with the truthful per-project
 *                   approval-pending message (Google gates GBP API access)
 *   anything else → "needs_attention" with a short reason
 */
export async function GET(req: NextRequest) {
  const origin = await appUrl();

  const done = (search = "") => {
    const res = NextResponse.redirect(new URL(`/app/settings/integrations${search}`, origin));
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

  const provider = await getProviderFor(session);
  const ws = session.workspaceId;

  const params = req.nextUrl.searchParams;
  if (params.get("error")) {
    // User cancelled on Google's consent screen — not an integration fault.
    return done("?error=google_cancelled");
  }

  const code = params.get("code");
  const state = params.get("state");
  const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return done("?error=google_state");
  }

  const tokens = await exchangeCode({
    code,
    redirectUri: `${origin}/api/google/connect/callback`,
  });
  if (!tokens) {
    await provider.setIntegrationStatus(
      ws,
      "google",
      "needs_attention",
      "Google connection failed during token exchange — try connecting again.",
    );
    return done();
  }

  // Probe GBP account access once so the stored status reflects reality.
  const probe = await listAccounts(tokens.access_token);

  // Persist the refresh token (AES-256-GCM envelope — never plaintext) so the
  // profile sync can run later, including automatically once Google approves
  // the project. Google returns a refresh token only on first offline consent;
  // the connect flow forces prompt=consent so we reliably get one.
  const existingCredential = await provider.getGoogleCredential(ws);
  if (tokens.refresh_token) {
    await provider.saveGoogleCredential(ws, {
      encryptedRefreshToken: encryptSecret(tokens.refresh_token),
      googleAccount: probe.ok ? probe.data[0]?.name : undefined,
      scopes: tokens.scope ?? "https://www.googleapis.com/auth/business.manage",
    });
  } else if (!existingCredential) {
    await provider.setIntegrationStatus(
      ws,
      "google",
      "needs_attention",
      "Google did not return durable offline access - reconnect and approve access again.",
    );
    return done("?error=google_offline_access");
  }

  if (probe.ok) {
    await provider.setIntegrationStatus(
      ws,
      "google",
      "connected",
      "Google account connected — profile data will sync",
    );
    const sync = await provider.syncGoogleProfile(ws);
    if (!sync.ok) {
      await provider.setIntegrationStatus(
        ws,
        "google",
        "needs_attention",
        sync.error ?? "Google connected, but the first profile sync failed.",
      );
    }
  } else if (probe.reason === "not_approved") {
    // Report what Google actually said. This used to assert "approval pending,
    // typically 1–2 weeks" for every 403, which is wrong — and expensively so —
    // when the real cause is simply that the My Business APIs were never
    // enabled on the project, a change that takes effect immediately.
    await provider.setIntegrationStatus(ws, "google", "needs_attention", `Connected — ${probe.detail}`);
  } else if (probe.reason === "unauthorized") {
    await provider.setIntegrationStatus(
      ws,
      "google",
      "needs_attention",
      "Google authorized, but the granted access couldn't read your Business Profile — try reconnecting.",
    );
  } else {
    await provider.setIntegrationStatus(
      ws,
      "google",
      "needs_attention",
      "Google connected, but the Business Profile check failed — we'll retry on next sync.",
    );
  }

  return done();
}
