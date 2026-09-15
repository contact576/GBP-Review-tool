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
  // An agency or platform admin working inside a workspace they opened from
  // their own console (`homeWorkspaceId` set) acts as its owner everywhere
  // else, so they may connect its Google profile too — the credential lands on
  // `session.workspaceId`, which is that workspace, never the admin's own.
  const acting =
    (session.role === "agency_admin" || session.role === "platform_admin") && Boolean(session.homeWorkspaceId);
  if (session.role !== "owner" && session.role !== "manager" && !acting) {
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
