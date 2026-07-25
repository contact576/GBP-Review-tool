import { NextResponse } from "next/server";
import { appUrl } from "@/lib/utils/app-url";
import { classifyQrHit } from "@/lib/qr/scan-signal";
import { resolveQrScan } from "@/lib/qr/resolve";

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
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const base = await appUrl();
  try {
    const { slug } = await params;
    const destination = await resolveQrScan({
      slug,
      hit: classifyQrHit({ method: req.method, headers: req.headers }),
    });

    if (destination.kind === "review_session") {
      return NextResponse.redirect(new URL(`/r/${destination.token}`, base), 302);
    }
    if (destination.kind === "google_review") {
      // Absolute, off-site and already protocol-checked in lib/qr/degrade.
      return NextResponse.redirect(destination.url, 302);
    }
  } catch {
    // Fall through to the expired page.
  }
  return NextResponse.redirect(new URL("/q-expired", base), 302);
}
