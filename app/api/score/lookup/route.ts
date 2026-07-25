import { NextResponse } from "next/server";
import { placesEnabled } from "@/lib/google/config";
import {
  BENCHMARK_RADIUS_METERS,
  MIN_BENCHMARK_SAMPLE,
  getPlaceDetails,
  getPlaceLocation,
  publicProfileCompleteness,
  searchBusinesses,
  searchNearbyCompetitors,
  summarizeNearby,
} from "@/lib/google/places";
import { boundedString, guardPublicApi, readJsonObject } from "@/lib/security/api";

export const runtime = "nodejs";

/**
 * Free score tool — the ONLY source of numbers for the public Local Growth
 * Score. Everything returned here is read straight off Google's public Places
 * data. There is no estimated, seeded, or placeholder path: when Google can't
 * answer, the route says so and the tool renders an honest unavailable state
 * instead of a score.
 *
 * Three modes, deliberately separate so the client can bind its progress steps
 * to real network phases rather than to a timer:
 *   · "match"     → find the business on Google (Text Search)
 *   · "details"   → read its public profile signals (Place Details)
 *   · "benchmark" → aggregate REAL nearby businesses in the same category
 */

type Unavailable =
  | "no_key"
  | "not_found"
  | "no_location"
  | "no_category"
  | "too_few"
  | "error";

function unavailable(status: Unavailable, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, status, ...extra });
}

export async function POST(req: Request) {
  const limited = guardPublicApi(req, "score-lookup", 30, 60_000);
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req, 8_192);
  } catch {
    return unavailable("error");
  }

  if (!placesEnabled()) return unavailable("no_key");

  switch (boundedString(body.mode, 24)) {
    case "details":
      return detailsLookup(body);
    case "benchmark":
      return benchmarkLookup(body);
    default:
      return matchLookup(body);
  }
}

// ── Mode: match ─────────────────────────────────────────────────────────────

async function matchLookup(body: Record<string, unknown>) {
  const business = boundedString(body.business, 160);
  const category = boundedString(body.category, 120);
  if (!business) return unavailable("not_found");

  const match = await searchBusinesses(
    category && category !== "Other local business" ? `${business} ${category}` : business,
  );
  if (!match.ok) return unavailable(match.reason === "no_key" ? "no_key" : "error");
  const top = match.places[0];
  if (!top) return unavailable("not_found");

  return NextResponse.json({
    ok: true,
    status: "ok",
    place: {
      placeId: top.placeId,
      name: top.name,
      address: top.address,
      city: top.city,
      category: top.category,
    },
  });
}

// ── Mode: details ───────────────────────────────────────────────────────────

async function detailsLookup(body: Record<string, unknown>) {
  const placeId = boundedString(body.placeId, 200);
  if (!placeId) return unavailable("not_found");

  const result = await getPlaceDetails(placeId);
  if (!result.ok) {
    return unavailable(
      result.reason === "no_key"
        ? "no_key"
        : result.reason === "not_found"
          ? "not_found"
          : "error",
    );
  }

  const d = result.details;
  const profile = d.profile ?? {
    hasWebsite: false,
    hasPhone: false,
    hasHours: false,
    hasDescription: false,
    photoSampleCount: 0,
  };

  // Newest timestamped review in the PUBLIC SAMPLE (Google exposes at most 5).
  // `null` means genuinely unknown and is never substituted with a guess.
  const newest = d.reviews
    .map((r) => r.publishedAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .pop();
  const daysSinceLastReview =
    d.reviewCount === 0
      ? 999 // known fact: there are no reviews at all, so nothing is recent
      : newest
        ? daysBetween(newest, Date.now())
        : null;

  return NextResponse.json({
    ok: true,
    status: "ok",
    place: {
      placeId: d.placeId,
      name: d.name,
      address: d.address,
      rating: d.rating,
      reviewCount: d.reviewCount,
      category: d.category,
      mapsUri: d.mapsUri ?? null,
      businessStatus: d.businessStatus ?? null,
      hasLocation: Boolean(d.location),
    },
    signals: {
      daysSinceLastReview,
      /** How many reviews Google actually returned (the sample, at most 5). */
      reviewSampleSize: d.reviews.length,
      /** A FLOOR — Places caps the photo array. Render as "at least N". */
      photoSampleCount: profile.photoSampleCount,
      profileCompleteness: publicProfileCompleteness(profile),
      present: {
        website: profile.hasWebsite,
        phone: profile.hasPhone,
        hours: profile.hasHours,
        description: profile.hasDescription,
      },
    },
  });
}

function daysBetween(iso: string, now: number): number | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((now - t) / 86_400_000));
}

// ── Mode: benchmark ─────────────────────────────────────────────────────────

async function benchmarkLookup(body: Record<string, unknown>) {
  const placeId = boundedString(body.placeId, 200);
  const category = boundedString(body.category, 120);
  if (!placeId) return unavailable("not_found");

  // Coordinates are resolved SERVER-SIDE from the Place ID so the search
  // circle can't be pointed elsewhere by the browser — a benchmark labelled
  // "nearby" has to actually be nearby.
  const located = await getPlaceLocation(placeId);
  if (!located.ok) {
    return unavailable(located.reason === "no_key" ? "no_key" : "no_location");
  }

  // Prefer Google's own category for the place; fall back to the user's pick.
  const query = located.category || category;
  if (!query) return unavailable("no_category");

  const nearby = await searchNearbyCompetitors(located.location, query, {
    excludePlaceId: placeId,
    radiusMeters: BENCHMARK_RADIUS_METERS,
  });
  if (!nearby.ok) return unavailable(nearby.reason === "no_key" ? "no_key" : "error");

  const benchmark = summarizeNearby(nearby.competitors, nearby.radiusMeters);
  if (!benchmark) {
    return unavailable("too_few", { minimumSample: MIN_BENCHMARK_SAMPLE });
  }

  return NextResponse.json({ ok: true, status: "ok", benchmark });
}
