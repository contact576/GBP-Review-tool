import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/jwt";

/**
 * Two responsibilities, deliberately separated (V10):
 *
 *  1. AUTH GATING — only for the protected console prefixes. Public surfaces
 *     (marketing, /r customer review flow, /q, /w widget, /staff) are never
 *     forced through a session check here.
 *
 *  2. SECURITY HEADERS — applied to EVERY matched (HTML) route, not just the
 *     consoles. Previously the CSP and anti-framing headers were set only for
 *     the console prefixes, leaving the customer review flow and marketing pages
 *     with no CSP and framable (clickjacking). The embeddable widget under /w is
 *     the one intentional exception: it must be frameable by customer sites.
 */

const PROTECTED = /^\/(app|agency|admin|onboarding|staff)(\/|$)/;

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── 1. Auth gating (protected prefixes only) ──────────────
  if (PROTECTED.test(pathname)) {
    const redirect = () => {
      const url = req.nextUrl.clone();
      url.pathname = "/sign-in";
      url.searchParams.set("next", pathname);
      return applySecurityHeaders(NextResponse.redirect(url), pathname);
    };

    const raw = req.cookies.get("foundly_session")?.value;
    if (!raw) return redirect();
    const claims = await verifySession(raw);
    if (!claims) return redirect();
    const role = claims.role;

    if (pathname.startsWith("/admin") && role !== "platform_admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/app";
      return applySecurityHeaders(NextResponse.redirect(url), pathname);
    }
    if (pathname.startsWith("/agency") && role !== "agency_admin" && role !== "owner") {
      const url = req.nextUrl.clone();
      url.pathname = "/app";
      return applySecurityHeaders(NextResponse.redirect(url), pathname);
    }
  }

  // ── 2. Security headers (all matched routes) ──────────────
  return applySecurityHeaders(NextResponse.next(), pathname);
}

function applySecurityHeaders(response: NextResponse, pathname: string): NextResponse {
  const isProd = process.env.NODE_ENV === "production";
  const scriptDev = isProd ? "" : " 'unsafe-eval'";
  const connectDev = isProd ? "" : " ws: http:";
  const upgrade = isProd ? "; upgrade-insecure-requests" : "";

  // The public review widget is meant to be embedded on customer websites, so
  // it must NOT be frame-denied. Everything else is frame-denied.
  const isEmbeddableWidget = pathname.startsWith("/w/");
  const frameAncestors = isEmbeddableWidget ? "frame-ancestors *" : "frame-ancestors 'none'";
  if (!isEmbeddableWidget) {
    response.headers.set("X-Frame-Options", "DENY");
  }

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
      frameAncestors,
    ].join("; ") + upgrade,
  );
  return response;
}

export const config = {
  // Every route EXCEPT API handlers (which return their own responses and, in
  // one case, set a stricter sandbox CSP of their own) and Next.js internals.
  matcher: ["/((?!api/|_next/).*)"],
};
