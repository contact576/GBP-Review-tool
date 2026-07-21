import "server-only";
import { googleMapsApiKey } from "./config";

/**
 * Google Places API (New) — Text Search, server-only.
 *
 * Used for real business lookup in onboarding and the free score tool.
 * Requires GOOGLE_MAPS_API_KEY with "Places API (New)" enabled; without a
 * key every call returns `{ ok: false, reason: "no_key" }` so callers can
 * fall back to honest keyless states.
 */

const SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_ENDPOINT = "https://places.googleapis.com/v1/places";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.primaryTypeDisplayName",
].join(",");
const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "rating",
  "userRatingCount",
  "primaryTypeDisplayName",
  "googleMapsUri",
  "location",
  "reviews.rating",
  "reviews.text",
  "reviews.originalText",
  "reviews.authorAttribution",
  "reviews.publishTime",
  "reviews.relativePublishTimeDescription",
].join(",");

export interface PlaceSummary {
  placeId: string;
  name: string;
  address: string;
  city: string;
  rating: number;
  reviewCount: number;
  category: string;
}

export type PlacesResult =
  | { ok: true; places: PlaceSummary[] }
  | { ok: false; reason: "no_key" | "error"; detail: string };

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  primaryTypeDisplayName?: { text?: string };
}

/** Text-search real businesses. Best-effort, never throws. */
export async function searchBusinesses(
  query: string,
  region?: "US" | "CA",
): Promise<PlacesResult> {
  const apiKey = googleMapsApiKey();
  if (!apiKey) {
    return { ok: false, reason: "no_key", detail: "GOOGLE_MAPS_API_KEY is not set" };
  }
  const textQuery = query.trim();
  if (!textQuery) return { ok: true, places: [] };

  try {
    const res = await fetch(SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery, regionCode: region ?? "US" }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        reason: "error",
        detail: `Places API ${res.status}: ${body.slice(0, 300)}`,
      };
    }
    const data = (await res.json()) as { places?: RawPlace[] };
    const places = (data.places ?? [])
      .slice(0, 6)
      .map(toSummary)
      .filter((p): p is PlaceSummary => p !== null);
    return { ok: true, places };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message : "Network error reaching Places API",
    };
  }
}

function toSummary(raw: RawPlace): PlaceSummary | null {
  if (!raw.id) return null;
  const address = raw.formattedAddress ?? "";
  return {
    placeId: raw.id,
    name: raw.displayName?.text ?? "Unnamed business",
    address,
    city: cityFromAddress(address),
    rating: typeof raw.rating === "number" ? raw.rating : 0,
    reviewCount: typeof raw.userRatingCount === "number" ? raw.userRatingCount : 0,
    category: raw.primaryTypeDisplayName?.text ?? "",
  };
}

/**
 * Best-effort city extraction from a formatted address. US/CA addresses
 * usually end "…, City, ST 12345, Country" — the second-to-last segment is
 * the region+postal block, so step back one more when it contains digits.
 */
function cityFromAddress(formattedAddress: string): string {
  const parts = formattedAddress
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return "";
  const secondToLast = parts[parts.length - 2] ?? "";
  if (/\d/.test(secondToLast) || /^[A-Z]{2}$/.test(secondToLast)) {
    return parts[parts.length - 3] ?? secondToLast;
  }
  return secondToLast;
}

/** Google's "write a review" deep link for a Place ID. */
export function reviewUrlFor(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

// ── Place Details (public profile data: aggregate + review sample) ──────────

/** One public review as Google exposes it through the Places API. */
export interface PublicReview {
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  /** Human phrase Google returns, e.g. "2 weeks ago". */
  relativeTime: string;
  /** RFC3339 publish time when Google provides it. */
  publishedAt?: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  /** Aggregate star rating across ALL Google reviews (0 when none). */
  rating: number;
  /** TOTAL number of Google reviews — the real, complete count. */
  reviewCount: number;
  category: string;
  mapsUri?: string;
  location?: { latitude: number; longitude: number };
  /**
   * A SAMPLE of recent public reviews (Google's Places API returns at most
   * five). Never the full history — callers must label it as a sample and use
   * `reviewCount` for the true total.
   */
  reviews: PublicReview[];
}

export type PlaceDetailsResult =
  | { ok: true; details: PlaceDetails }
  | { ok: false; reason: "no_key" | "not_found" | "error"; detail: string };

interface RawReview {
  rating?: number;
  text?: { text?: string };
  originalText?: { text?: string };
  authorAttribution?: { displayName?: string };
  publishTime?: string;
  relativePublishTimeDescription?: string;
}
interface RawDetails {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  primaryTypeDisplayName?: { text?: string };
  googleMapsUri?: string;
  location?: { latitude?: number; longitude?: number };
  reviews?: RawReview[];
}

/**
 * Fetch a business's public profile data by Place ID: the aggregate rating and
 * total review count (both complete and real), plus up to five recent public
 * reviews (a sample — Google's public API never exposes the full history).
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetailsResult> {
  const apiKey = googleMapsApiKey();
  if (!apiKey) return { ok: false, reason: "no_key", detail: "GOOGLE_MAPS_API_KEY is not set" };
  const id = placeId.trim();
  if (!id) return { ok: false, reason: "not_found", detail: "No place id" };

  try {
    const res = await fetch(`${DETAILS_ENDPOINT}/${encodeURIComponent(id)}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 404) return { ok: false, reason: "not_found", detail: "Place not found" };
      return { ok: false, reason: "error", detail: `Place Details ${res.status}: ${body.slice(0, 300)}` };
    }
    const raw = (await res.json()) as RawDetails;
    const address = raw.formattedAddress ?? "";
    return {
      ok: true,
      details: {
        placeId: raw.id ?? id,
        name: raw.displayName?.text ?? "",
        address,
        rating: typeof raw.rating === "number" ? raw.rating : 0,
        reviewCount: typeof raw.userRatingCount === "number" ? raw.userRatingCount : 0,
        category: raw.primaryTypeDisplayName?.text ?? "",
        mapsUri: raw.googleMapsUri,
        location:
          typeof raw.location?.latitude === "number" &&
          typeof raw.location.longitude === "number"
            ? { latitude: raw.location.latitude, longitude: raw.location.longitude }
            : undefined,
        reviews: (raw.reviews ?? []).slice(0, 5).map(toPublicReview),
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message : "Network error reaching Place Details",
    };
  }
}

function toPublicReview(raw: RawReview): PublicReview {
  const rating = Math.min(5, Math.max(1, Math.round(raw.rating ?? 5))) as 1 | 2 | 3 | 4 | 5;
  return {
    author: raw.authorAttribution?.displayName ?? "A Google user",
    rating,
    text: raw.text?.text ?? raw.originalText?.text ?? "",
    relativeTime: raw.relativePublishTimeDescription ?? "",
    publishedAt: raw.publishTime,
  };
}
