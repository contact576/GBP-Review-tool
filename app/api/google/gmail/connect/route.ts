import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { googleSignInEnabled } from "@/lib/google/config";
import {
  buildAuthUrl,
  makeStateCookie,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
} from "@/lib/google/oauth";
import { appUrl } from "@/lib/utils/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Exactly what the consent screen asks for — nothing broader. */
const GMAIL_CONNECT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "email",
];

/**
 * Start the "Send email through Gmail" connect flow (owner/manager only).
 *
 * Mirrors the GBP connect route: offline access + forced consent so Google
 * returns a refresh token, a random `state` mirrored in a short-lived httpOnly
 * cookie for CSRF. Deliberately NOT include_granted_scopes — this grant must
 * stay a stand-alone gmail.send token that the owner can revoke without
 * touching their Business Profile connection.
 *
 * This handler mutates nothing but the state cookie, so a stray GET (prefetch,
 * link preview) is harmless; the callback is the only step that writes.
 */
export async function GET() {
  const origin = await appUrl();

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }
  if (session.role !== "owner" && session.role !== "manager") {
    return NextResponse.redirect(new URL("/app/settings/channels?error=forbidden", origin));
  }
  if (!googleSignInEnabled()) {
    return NextResponse.redirect(
      new URL("/app/settings/channels?error=google_not_configured", origin),
    );
  }

  const state = makeStateCookie();
  const authUrl = buildAuthUrl({
    scopes: GMAIL_CONNECT_SCOPES,
    redirectUri: `${origin}/api/google/gmail/connect/callback`,
    state,
    accessType: "offline",
    prompt: "consent",
    includeGrantedScopes: false,
    loginHint: session.email || undefined,
  });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  return res;
}
