import { type NextRequest, NextResponse } from "next/server";
import { googleSignInEnabled } from "@/lib/google/config";
import {
  buildAuthUrl,
  makeStateCookie,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
} from "@/lib/google/oauth";
import { appUrl } from "@/lib/utils/app-url";
import { parseReferralCode } from "@/lib/referrals/code";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start "Sign in with Google": set the CSRF state cookie, redirect to Google. */
const REFERRAL_COOKIE = "foundly_referral";

export async function GET(req: NextRequest) {
  const origin = await appUrl();
  if (!googleSignInEnabled()) {
    return NextResponse.redirect(new URL("/sign-in?error=google_not_configured", origin));
  }

  const state = makeStateCookie();
  const authUrl = buildAuthUrl({
    scopes: ["openid", "email", "profile"],
    redirectUri: `${origin}/api/auth/google/callback`,
    state,
    accessType: "online",
  });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  const referralCode = req.nextUrl.searchParams.get("ref")?.slice(0, 220);
  if (referralCode && parseReferralCode(referralCode)) {
    res.cookies.set(REFERRAL_COOKIE, referralCode, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: OAUTH_STATE_TTL_SECONDS,
    });
  }
  return res;
}
