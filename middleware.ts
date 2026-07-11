import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Gate the authenticated surfaces only. Marketing, customer (token), and staff
 * surfaces bypass this. Unauthenticated hits redirect to /sign-in with a return.
 */
const GATED = ["/app", "/agency", "/admin", "/onboarding"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isGated = GATED.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!isGated) return NextResponse.next();

  const session = req.cookies.get(SESSION_COOKIE)?.value;
  if (session) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/sign-in";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*", "/agency/:path*", "/admin/:path*", "/onboarding/:path*"],
};
