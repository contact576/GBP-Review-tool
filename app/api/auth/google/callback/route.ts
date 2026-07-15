import { type NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth/session";
import { getRealProvider } from "@/lib/data";
import { googleSignInEnabled } from "@/lib/google/config";
import { decodeIdToken, exchangeCode, OAUTH_STATE_COOKIE } from "@/lib/google/oauth";
import { appUrl } from "@/lib/utils/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Sign in with Google" callback: verify CSRF state, exchange the code,
 * verify the ID token, upsert the user, mint a real (non-demo) session.
 * New Google users land on /app — the dashboard's empty state guides them
 * into onboarding.
 */
export async function GET(req: NextRequest) {
  const origin = await appUrl();

  const fail = (code: string) => {
    const res = NextResponse.redirect(new URL(`/sign-in?error=${code}`, origin));
    res.cookies.delete(OAUTH_STATE_COOKIE);
    return res;
  };

  if (!googleSignInEnabled()) return fail("google_not_configured");

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return fail("google"); // user denied consent etc.

  const code = params.get("code");
  const state = params.get("state");
  const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !cookieState || state !== cookieState) return fail("google");

  const tokens = await exchangeCode({
    code,
    redirectUri: `${origin}/api/auth/google/callback`,
  });
  if (!tokens?.id_token) return fail("google");

  const identity = await decodeIdToken(tokens.id_token);
  if (!identity) return fail("google");

  const provider = await getRealProvider(); // Postgres (or memory fallback) — never demo
  const user = await provider.upsertGoogleUser({
    googleSub: identity.sub,
    email: identity.email,
    name: identity.name,
  });
  if (!user) return fail("google");

  await createSession({
    userId: user.id,
    workspaceId: user.workspaceId,
    role: user.role,
    isDemo: false,
    name: user.name,
    email: user.email,
  });

  const res = NextResponse.redirect(new URL("/app", origin));
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
}
