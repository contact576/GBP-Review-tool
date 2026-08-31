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
/**
 * Everything Places (New) exposes that the profile audit can actually check.
 * Each field here becomes an audit signal, so adding one means adding a check —
 * the audit never claims to have seen a field that is not in this mask.
 */
const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "rating",
  "userRatingCount",
  "primaryTypeDisplayName",
  "types",
  "googleMapsUri",
  "location",
  "businessStatus",
  // Presence-only profile signals (see `PlaceProfileFields`). We read whether
  // Google returns them at all — never invent a value when they're missing.
  "websiteUri",
  "nationalPhoneNumber",
  "regularOpeningHours",
  "editorialSummary",
  "photos",
  "reviews.rating",
  "reviews.text",
  "reviews.originalText",
  "reviews.authorAttribution",
  "reviews.publishTime",
  "reviews.relativePublishTimeDescription",
].join(",");
/** Minimal mask for the "where is this place?" lookup (Essentials SKU only). */
const LOCATION_FIELD_MASK = ["id", "location", "primaryTypeDisplayName"].join(",");

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

/** Shared Text Search transport. Best-effort, never throws. */
async function runTextSearch(
  body: Record<string, unknown>,
  limit: number,
): Promise<PlacesResult> {
  const apiKey = googleMapsApiKey();
  if (!apiKey) {
    return { ok: false, reason: "no_key", detail: "GOOGLE_MAPS_API_KEY is not set" };
  }
  try {
    const res = await fetch(SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        reason: "error",
        detail: `Places API ${res.status}: ${detail.slice(0, 300)}`,
      };
    }
    const data = (await res.json()) as { places?: RawPlace[] };
    const places = (data.places ?? [])
      .slice(0, limit)
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

/** Text-search real businesses. Best-effort, never throws. */
export async function searchBusinesses(
  query: string,
  region?: "US" | "CA",
): Promise<PlacesResult> {
  const textQuery = query.trim();
  if (!textQuery) {
    return googleMapsApiKey()
      ? { ok: true, places: [] }
      : { ok: false, reason: "no_key", detail: "GOOGLE_MAPS_API_KEY is not set" };
  }
  return runTextSearch({ textQuery, regionCode: region ?? "US" }, 6);
}

/**
 * Words that describe an industry rather than identify a business. A match
 * resting only on these is not a match: "Dental" typed into the score tool must
 * not silently resolve to whichever dental practice Places ranked first.
 */
const GENERIC_TOKENS = new Set([
  "and", "the", "inc", "llc", "ltd", "co", "corp", "company", "group", "services",
  "service", "clinic", "centre", "center", "studio", "shop", "store", "salon",
  "spa", "dental", "dentist", "dentistry", "physio", "physiotherapy", "chiro",
  "chiropractic", "hvac", "heating", "cooling", "plumbing", "plumber", "auto",
  "repair", "restaurant", "cafe", "law", "legal", "lawyers", "med", "medical",
  "renovation", "renovations", "contracting", "solutions", "local", "business",
]);

/** Lowercase, strip accents and punctuation, split into meaningful tokens. */
function tokenize(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    // Apostrophes join a word rather than break it: O'Brien is one token, and
    // splitting it stops the listing spelled "OBrien" from ever matching.
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1);
}

/**
 * Does `placeName` plausibly name the business the user typed?
 *
 * Places Text Search always returns *something*, ranked by relevance to the
 * whole query — so a query polluted by an unrelated term (the score tool used
 * to append the category select's default) comes back with a real, confident,
 * completely different business. Presenting that as "your public Google
 * listing" is worse than showing nothing, so callers use this to decide whether
 * the top hit may be treated as the user's own listing.
 *
 * Containment is checked in both directions: the typed name often carries extra
 * words the listing lacks ("… Toronto"), and just as often lacks words the
 * listing carries ("Bright Smile" -> "Bright Smile Dental Clinic"). At least one
 * shared token must be distinctive, so an industry word alone never matches.
 */
export function isPlausibleNameMatch(typed: string, placeName: string): boolean {
  const typedTokens = tokenize(typed);
  const placeTokens = tokenize(placeName);
  if (typedTokens.length === 0 || placeTokens.length === 0) return false;

  const typedSet = new Set(typedTokens);
  const placeSet = new Set(placeTokens);
  const shared = [...typedSet].filter((t) => placeSet.has(t));
  if (shared.length === 0) return false;
  if (!shared.some((t) => !GENERIC_TOKENS.has(t))) return false;

  const containment = Math.max(
    shared.length / typedSet.size,
    shared.length / placeSet.size,
  );
  return containment >= 0.6;
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

/**
 * Presence-only profile signals read off the PUBLIC listing.
 *
 * Every field here answers "did Google return this at all?" — nothing is
 * estimated. `photoSampleCount` is deliberately named a *sample*: the Places
 * API caps the photo array, so it is a FLOOR ("at least N"), never the true
 * number of photos on the listing.
 */
export interface PlaceProfileFields {
  hasWebsite: boolean;
  hasPhone: boolean;
  hasHours: boolean;
  hasDescription: boolean;
  photoSampleCount: number;
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
  /** e.g. "OPERATIONAL" / "CLOSED_TEMPORARILY" — verbatim from Google. */
  businessStatus?: string;
  /**
   * Presence-only public profile signals. Optional because a caller may have
   * been built against an older field mask; treat `undefined` as "unknown",
   * never as "absent".
   */
  profile?: PlaceProfileFields;
  /**
   * A SAMPLE of recent public reviews (Google's Places API returns at most
   * five). Never the full history — callers must label it as a sample and use
   * `reviewCount` for the true total.
   */
  reviews: PublicReview[];

  // ── Public profile fields the audit checks ──────────────────
  /** Website on the public Google listing, if any. */
  websiteUri?: string;
  /** Public phone number on the listing, if any. */
  phone?: string;
  /** True when Google publishes regular opening hours for the listing. */
  hasHours: boolean;
  /** Number of weekday entries Google publishes (0-7). */
  openDayCount: number;
  /** How many photos are attached to the public listing. */
  photoCount: number;
  /** Google's editorial summary, when present. */
  editorialSummary?: string;
  /** All Google place types on the listing (proxy for category coverage). */
  types: string[];
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
  types?: string[];
  googleMapsUri?: string;
  location?: { latitude?: number; longitude?: number };
  businessStatus?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[]; periods?: unknown[] };
  editorialSummary?: { text?: string };
  photos?: unknown[];
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
    const weekdays = raw.regularOpeningHours?.weekdayDescriptions ?? [];
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
        businessStatus: raw.businessStatus,
        profile: toProfileFields(raw),
        reviews: (raw.reviews ?? []).slice(0, 5).map(toPublicReview),
        websiteUri: raw.websiteUri,
        phone: raw.nationalPhoneNumber,
        hasHours: weekdays.length > 0 || (raw.regularOpeningHours?.periods?.length ?? 0) > 0,
        // "Monday: Closed" still counts as published hours; a listing with no
        // weekday lines at all is what the audit flags.
        openDayCount: weekdays.length,
        photoCount: raw.photos?.length ?? 0,
        editorialSummary: raw.editorialSummary?.text,
        types: raw.types ?? [],
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

function toProfileFields(raw: RawDetails): PlaceProfileFields {
  const hours = raw.regularOpeningHours;
  return {
    hasWebsite: typeof raw.websiteUri === "string" && raw.websiteUri.trim().length > 0,
    hasPhone:
      typeof raw.nationalPhoneNumber === "string" && raw.nationalPhoneNumber.trim().length > 0,
    hasHours: Boolean(
      (hours?.weekdayDescriptions?.length ?? 0) > 0 || (hours?.periods?.length ?? 0) > 0,
    ),
    hasDescription:
      typeof raw.editorialSummary?.text === "string" &&
      raw.editorialSummary.text.trim().length > 0,
    photoSampleCount: Array.isArray(raw.photos) ? raw.photos.length : 0,
  };
}

/**
 * Deterministic 0–100 profile-completeness score built ONLY from which real
 * fields the public listing exposes. No estimation, no randomness — the same
 * listing always scores the same number.
 *
 * Weighting (sums to 100), ordered by how much each field affects whether a
 * searcher can actually act on the listing:
 *   · opening hours       30 — the single biggest "can I go now?" signal
 *   · phone number        25 — the primary local-conversion path
 *   · website             25 — where the searcher verifies and books
 *   · business description 20 — helps Google and searchers understand the fit
 *
 * Anything Google does not expose publicly (posts, Q&A, services, owner
 * replies) is deliberately NOT part of this number.
 */
export const COMPLETENESS_WEIGHTS = Object.freeze({
  hours: 30,
  phone: 25,
  website: 25,
  description: 20,
});

export function publicProfileCompleteness(profile: PlaceProfileFields): number {
  return (
    (profile.hasHours ? COMPLETENESS_WEIGHTS.hours : 0) +
    (profile.hasPhone ? COMPLETENESS_WEIGHTS.phone : 0) +
    (profile.hasWebsite ? COMPLETENESS_WEIGHTS.website : 0) +
    (profile.hasDescription ? COMPLETENESS_WEIGHTS.description : 0)
  );
}

// ── Nearby competitors (real area benchmark) ────────────────────────────────

/** Smallest real sample we will EVER render an area benchmark from. */
export const MIN_BENCHMARK_SAMPLE = 3;

/** Default location-bias radius for the nearby search, in metres. */
export const BENCHMARK_RADIUS_METERS = 8_000;

export type NearbyCompetitorsResult =
  | { ok: true; competitors: PlaceSummary[]; radiusMeters: number }
  | { ok: false; reason: "no_key" | "error"; detail: string };

/**
 * Find REAL nearby businesses in the same category, biased to a circle around
 * the subject business's own coordinates. Returns the raw matches — callers
 * aggregate them via {@link summarizeNearby}, which refuses to produce a
 * benchmark from too small a sample.
 */
export async function searchNearbyCompetitors(
  location: { latitude: number; longitude: number },
  category: string,
  options?: { excludePlaceId?: string; radiusMeters?: number },
): Promise<NearbyCompetitorsResult> {
  const radiusMeters = Math.min(
    50_000,
    Math.max(1_000, options?.radiusMeters ?? BENCHMARK_RADIUS_METERS),
  );
  const textQuery = category.trim();
  if (!textQuery) {
    return { ok: false, reason: "error", detail: "No category to search nearby" };
  }
  if (
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude) ||
    Math.abs(location.latitude) > 90 ||
    Math.abs(location.longitude) > 180
  ) {
    return { ok: false, reason: "error", detail: "Invalid location for nearby search" };
  }

  const result = await runTextSearch(
    {
      textQuery,
      maxResultCount: 20,
      locationBias: {
        circle: {
          center: { latitude: location.latitude, longitude: location.longitude },
          radius: radiusMeters,
        },
      },
    },
    20,
  );
  if (!result.ok) return result;

  const exclude = options?.excludePlaceId;
  return {
    ok: true,
    competitors: result.places.filter((p) => !exclude || p.placeId !== exclude),
    radiusMeters,
  };
}

/** Aggregate of REAL nearby listings. Only ever built from actual Places rows. */
export interface NearbyBenchmark {
  /** How many real nearby businesses the aggregate is built from. */
  sampleSize: number;
  /** Mean star rating across those businesses (1 decimal). */
  rating: number;
  /** MEDIAN total review count — robust against one runaway listing. */
  reviewCount: number;
  /** Radius of the search circle, in metres. */
  radiusMeters: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid];
  if (hi === undefined) return 0;
  if (sorted.length % 2 === 1) return hi;
  const lo = sorted[mid - 1];
  return lo === undefined ? hi : (lo + hi) / 2;
}

/**
 * Aggregate nearby listings into a benchmark, or return `null` when the real
 * sample is too thin to be honest about. Listings with no rating/reviews are
 * dropped first: an unrated listing carries no comparable signal, and keeping
 * it would drag the average toward a number nobody actually earned.
 */
export function summarizeNearby(
  competitors: PlaceSummary[],
  radiusMeters: number,
): NearbyBenchmark | null {
  const rated = competitors.filter((c) => c.rating > 0 && c.reviewCount > 0);
  if (rated.length < MIN_BENCHMARK_SAMPLE) return null;
  const ratingMean = rated.reduce((sum, c) => sum + c.rating, 0) / rated.length;
  return {
    sampleSize: rated.length,
    rating: Math.round(ratingMean * 10) / 10,
    reviewCount: Math.round(median(rated.map((c) => c.reviewCount))),
    radiusMeters,
  };
}

// ── Cheap location-only lookup ──────────────────────────────────────────────

export type PlaceLocationResult =
  | { ok: true; location: { latitude: number; longitude: number }; category: string }
  | { ok: false; reason: "no_key" | "not_found" | "error"; detail: string };

/**
 * Resolve a Place ID to its real coordinates using the smallest possible field
 * mask. Used to anchor the nearby-competitor search server-side so the circle
 * can never be spoofed by the browser.
 */
export async function getPlaceLocation(placeId: string): Promise<PlaceLocationResult> {
  const apiKey = googleMapsApiKey();
  if (!apiKey) return { ok: false, reason: "no_key", detail: "GOOGLE_MAPS_API_KEY is not set" };
  const id = placeId.trim();
  if (!id) return { ok: false, reason: "not_found", detail: "No place id" };

  try {
    const res = await fetch(`${DETAILS_ENDPOINT}/${encodeURIComponent(id)}`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": LOCATION_FIELD_MASK },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 404) return { ok: false, reason: "not_found", detail: "Place not found" };
      return { ok: false, reason: "error", detail: `Place Details ${res.status}: ${body.slice(0, 300)}` };
    }
    const raw = (await res.json()) as RawDetails;
    const lat = raw.location?.latitude;
    const lng = raw.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return { ok: false, reason: "not_found", detail: "Place has no public coordinates" };
    }
    return {
      ok: true,
      location: { latitude: lat, longitude: lng },
      category: raw.primaryTypeDisplayName?.text ?? "",
    };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message : "Network error reaching Place Details",
    };
  }
}
