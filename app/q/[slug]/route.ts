import { NextResponse } from "next/server";
import { classifyQrHit } from "@/lib/qr/scan-signal";
import { resolveQrScan } from "@/lib/qr/resolve";
import { consumeRateLimitDistributed } from "@/lib/security/api";
import { trustedClientIp } from "@/lib/security/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public QR scan endpoint — the URL every printed Foundly code encodes.
 *
 * Three outcomes, and none of them is an error page:
 *  - active code → mints a fresh walk-in review request and 302s into the
 *    customer flow at /r/{token};
 *  - degraded code (explicitly flagged, or the subscription has lapsed) →
 *    302s to the business's own public Google review page for the 90-day
 *    grace window, so printed table tents and counter cards keep working;
 *  - unknown code, or a grace window that has run out → the calm /q-expired
 *    page, which tells the truth instead of pretending.
 *
 * Counting: every hit that resolves a real asset is a SCAN. Only a genuine
 * browser navigation that is handed a live session is an OPEN — see
 * lib/qr/scan-signal.ts for why those are not the same event.
 *
 * The in-app redirect is RELATIVE on purpose. It used to be resolved against
 * `appUrl()`, which is derived from environment config — so a scan arriving on
 * any other origin (a custom domain, a preview deployment, a self-hosted port)
 * was bounced to the configured host instead of staying where the customer
 * already was. With no env set that host is localhost:3000, which is a dead end
 * for a real customer. A relative Location keeps every scan on the origin the
 * customer actually reached, in every environment. The degraded case is the one
 * exception: it points off-site to Google, so it stays absolute.
 *
 * ABUSE CONTROL: minting a request is an unauthenticated database write, so it
 * is rate-limited per slug and per client IP. Without this, a loop against any
 * known slug inflates the DB with junk requests, poisons the owner's scan/open
 * analytics, and freely mints valid review tokens (which gate the token-keyed
 * public endpoints). This uses the fleet-wide limiter rather than the
 * per-instance one — a serverless fan-out would otherwise give an attacker one
 * fresh bucket per instance. Over-limit scans fall through to /q-expired, so a
 * real customer never sees an error — they simply retry.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  // A relative Location is valid per RFC 7231 §7.1.2 and every browser
  // resolves it against the request URL, which is exactly what we want here.
  const redirectTo = (path: string) =>
    new NextResponse(null, { status: 302, headers: { location: path } });
  const expired = () => redirectTo("/q-expired");
  try {
    const { slug } = await params;
    if (!slug) return expired();

    const ip = trustedClientIp((name) => req.headers.get(name));
    const [bySlug, byIp] = await Promise.all([
      consumeRateLimitDistributed("qr-scan-slug", slug, 30, 60_000),
      consumeRateLimitDistributed("qr-scan-ip", ip, 60, 60_000),
    ]);
    if (!bySlug.allowed || !byIp.allowed) return expired();

    const destination = await resolveQrScan({
      slug,
      hit: classifyQrHit({ method: req.method, headers: req.headers }),
    });

    if (destination.kind === "review_session") {
      return redirectTo(`/r/${encodeURIComponent(destination.token)}`);
    }
    if (destination.kind === "google_review") {
      // Absolute, off-site and already protocol-checked in lib/qr/degrade.
      return NextResponse.redirect(destination.url, 302);
    }
  } catch {
    // Fall through to the expired page.
  }
  return expired();
}
