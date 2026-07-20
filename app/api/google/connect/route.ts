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

/**
 * Start the Google Business Profile connect flow (owner/manager only).
 * Offline access + forced consent so Google returns a refresh token.
 */
export async function GET() {
  const origin = await appUrl();

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }
  if (session.role !== "owner" && session.role !== "manager") {
    return NextResponse.redirect(new URL("/app/settings/integrations?error=forbidden", origin));
  }
  if (!googleSignInEnabled()) {
    return NextResponse.redirect(
      new URL("/app/settings/integrations?error=google_not_configured", origin),
    );
  }

  const state = makeStateCookie();
  const authUrl = buildAuthUrl({
    scopes: [
      "https://www.googleapis.com/auth/business.manage",
      "https://www.googleapis.com/auth/webmasters.readonly",
    ],
    redirectUri: `${origin}/api/google/connect/callback`,
    state,
    accessType: "offline",
    prompt: "consent",
    includeGrantedScopes: true,
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
