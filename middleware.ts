import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/jwt";

/**
 * Gates the authenticated surfaces with real JWT verification.
 * Marketing, customer (/r, /q), and staff surfaces bypass this.
 */
const LEGACY_ROLES = new Set(["owner", "agency_admin", "platform_admin"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const raw = req.cookies.get("foundly_session")?.value;

  const redirect = () => {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  };

  if (!raw) return redirect();

  // Legacy plain-role cookie (pre-JWT builds) — accepted as demo session.
  if (LEGACY_ROLES.has(raw)) return NextResponse.next();

  const claims = await verifySession(raw);
  if (!claims) return redirect();

  // Role-scope the consoles.
  if (pathname.startsWith("/admin") && claims.role !== "platform_admin") {
    const url = req.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/agency") && claims.role !== "agency_admin") {
    const url = req.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/app/:path*",
    "/agency/:path*",
    "/admin/:path*",
    "/onboarding/:path*",
    "/staff/:path*",
  ],
};
