import { NextResponse } from "next/server";
import { getPublicProviders } from "@/lib/data";
import { appUrl } from "@/lib/utils/app-url";
import { consumeRateLimit } from "@/lib/security/api";
import { trustedClientIp } from "@/lib/security/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public QR scan endpoint — the URL every printed Foundly code encodes.
 *
 * Each scan mints a fresh walk-in review request (incrementing the asset's
 * scan counter) and 302-redirects into the customer flow at /r/{token}.
 * Unknown, paused, or degraded codes land on the calm /q-expired fallback —
 * a scan must never dead-end on an error page.
 *
 * ABUSE CONTROL: minting a request is an unauthenticated database write, so it
 * is rate-limited per slug and per client IP. Without this, a loop against any
 * known slug inflates the DB with junk requests, poisons the owner's scan/open
 * analytics, and freely mints valid review tokens (which gate the token-keyed
 * public endpoints). Over-limit scans fall through to /q-expired, so a real
 * customer never sees an error — they simply retry.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const base = await appUrl();
  const expired = () => NextResponse.redirect(new URL("/q-expired", base), 302);
  try {
    const { slug } = await params;
    if (slug) {
      const ip = trustedClientIp((name) => req.headers.get(name));
      const bySlug = consumeRateLimit("qr-scan-slug", slug, 30, 60_000);
      const byIp = consumeRateLimit("qr-scan-ip", ip, 60, 60_000);
      if (!bySlug.allowed || !byIp.allowed) return expired();

      for (const provider of await getPublicProviders()) {
        try {
          const result = await provider.mintRequestFromQrSlug(slug);
          if (result) {
            return NextResponse.redirect(new URL(`/r/${result.token}`, base), 302);
          }
        } catch {
          // This store couldn't resolve the slug — try the next one.
        }
      }
    }
  } catch {
    // Fall through to the expired page.
  }
  return expired();
}
