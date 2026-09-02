import { NextResponse } from "next/server";
import { googleMapsApiKey } from "@/lib/google/config";
import { guardAuthenticatedApi } from "@/lib/security/api";
import { MAX_STATIC_MAP_PX, staticMapUrl } from "@/lib/google/static-map";

export const runtime = "nodejs";

/**
 * Server-side proxy for the Google Static Maps basemap behind the Rank Grid map.
 *
 * It exists for one reason: `GOOGLE_MAPS_API_KEY` must never reach the browser.
 * A Static Maps URL carries its key in the query string, so an <img src> built
 * on the client would publish the key to anyone who opens devtools — and the
 * same key holds Places, which is billed per call. Here the key stays on the
 * server and the browser only ever sees our own same-origin path.
 *
 * Every parameter is parsed as a bounded number rather than forwarded, so this
 * can only ever request a map — it is not a general image proxy.
 */
function parseNumber(
  value: string | null,
  { min, max, fallback }: { min: number; max: number; fallback?: number },
): number | null {
  if (value === null || value.trim() === "") return fallback ?? null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

export async function GET(req: Request) {
  const guard = await guardAuthenticatedApi(req, {
    scope: "rank-grid-basemap",
    roles: ["owner", "manager", "staff"],
    limit: 60,
    windowMs: 60_000,
  });
  if (!guard.ok) return guard.response;

  const apiKey = googleMapsApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "maps_not_configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const latitude = parseNumber(url.searchParams.get("lat"), { min: -85, max: 85 });
  const longitude = parseNumber(url.searchParams.get("lng"), { min: -180, max: 180 });
  const zoom = parseNumber(url.searchParams.get("zoom"), { min: 1, max: 20 });
  const width = parseNumber(url.searchParams.get("w"), {
    min: 64,
    max: MAX_STATIC_MAP_PX,
    fallback: 640,
  });
  const height = parseNumber(url.searchParams.get("h"), {
    min: 64,
    max: MAX_STATIC_MAP_PX,
    fallback: 640,
  });
  if (latitude === null || longitude === null || zoom === null || width === null || height === null) {
    return NextResponse.json({ error: "invalid_parameters" }, { status: 400 });
  }

  const target = staticMapUrl({
    apiKey,
    center: { latitude, longitude },
    zoom: Math.round(zoom),
    width,
    height,
  });

  try {
    const response = await fetch(target, { cache: "no-store" });
    if (!response.ok) {
      // Google puts the reason in the body; surfacing the status lets the client
      // fall back to the plain grid rather than showing a broken image.
      return NextResponse.json(
        { error: "basemap_unavailable", status: response.status },
        { status: 502 },
      );
    }
    const body = await response.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "image/png",
        // The basemap for a given centre/zoom is stable; caching keeps a page of
        // repeat views off the Static Maps bill.
        "Cache-Control": "private, max-age=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "basemap_unreachable" }, { status: 502 });
  }
}
