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
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.primaryTypeDisplayName",
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
