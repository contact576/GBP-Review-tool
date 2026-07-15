import { NextResponse } from "next/server";
import { getPublicProviders } from "@/lib/data";
import { appUrl } from "@/lib/utils/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public QR scan endpoint — the URL every printed Foundly code encodes.
 *
 * Each scan mints a fresh walk-in review request (incrementing the asset's
 * scan counter) and 302-redirects into the customer flow at /r/{token}.
 * Unknown, paused, or degraded codes land on the calm /q-expired fallback —
 * a scan must never dead-end on an error page.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const base = await appUrl();
  try {
    const { slug } = await params;
    if (slug) {
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
  return NextResponse.redirect(new URL("/q-expired", base), 302);
}
