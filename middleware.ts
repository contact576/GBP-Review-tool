import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/jwt";

/**
 * Gates the authenticated surfaces with real JWT verification.
 * Marketing, customer (/r, /q), and staff surfaces bypass this.
 */
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

  const claims = await verifySession(raw);
  if (!claims) return redirect();
  const role = claims.role;

  // Role-scope the consoles.
  if (pathname.startsWith("/admin") && role !== "platform_admin") {
    const url = req.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/agency") && role !== "agency_admin" && role !== "owner") {
    const url = req.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  const scriptDev = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";
  const connectDev = process.env.NODE_ENV === "production" ? "" : " ws: http:";
  const upgrade = process.env.NODE_ENV === "production" ? "; upgrade-insecure-requests" : "";
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${scriptDev}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self' https:${connectDev}`,
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ") + upgrade,
  );
  return response;
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
