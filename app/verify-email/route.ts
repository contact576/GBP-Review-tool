import { NextResponse } from "next/server";
import { getRealProvider } from "@/lib/data";
import { verifyEmailVerificationToken } from "@/lib/auth/email-verification";
import { guardPublicApi } from "@/lib/security/api";
import { appUrl } from "@/lib/utils/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Email confirmation landing (V17). Consumes a signed verification token and
 * marks the account's email verified, which lifts the outbound-send suppression.
 * The token is validated by HMAC + expiry only — no session required, so the
 * link works on any device. Rate-limited to blunt token-guessing.
 */
export async function GET(req: Request) {
  const base = await appUrl();
  const limited = guardPublicApi(req, "verify-email", 20, 60_000);
  if (limited) {
    return NextResponse.redirect(new URL("/sign-in?verify=throttled", base));
  }

  const token = new URL(req.url).searchParams.get("token") ?? "";
  const userId = verifyEmailVerificationToken(token);
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in?verify=invalid", base));
  }

  const provider = await getRealProvider();
  await provider.setEmailVerified(userId, true);
  return NextResponse.redirect(new URL("/app?verified=1", base));
}
