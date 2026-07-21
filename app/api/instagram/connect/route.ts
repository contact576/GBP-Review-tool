import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { instagramOAuthEnabled } from "@/lib/google/config";
import { makeStateCookie, OAUTH_STATE_TTL_SECONDS } from "@/lib/google/oauth";
import { buildInstagramAuthUrl, INSTAGRAM_STATE_COOKIE } from "@/lib/evidence/instagram-oauth";
import { appUrl } from "@/lib/utils/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const origin = await appUrl();
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/sign-in", origin));
  if (session.role !== "owner" && session.role !== "manager") {
    return NextResponse.redirect(new URL("/app/settings/integrations?error=forbidden", origin));
  }
  if (!instagramOAuthEnabled()) {
    return NextResponse.redirect(new URL("/app/settings/integrations?error=instagram_not_configured", origin));
  }
  const state = makeStateCookie();
  const redirectUri = `${origin}/api/instagram/connect/callback`;
  const response = NextResponse.redirect(buildInstagramAuthUrl({ redirectUri, state }));
  response.cookies.set(INSTAGRAM_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  return response;
}
