import "server-only";
import { googleMapsApiKey } from "./config";
import type { RankGridPoint, RankGridResult } from "@/lib/data/types";

const SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

/**
 * The rank number alone never answered "who is taking the calls here?" — the
 * field mask now carries enough of each result to name the businesses that
 * outrank us at every coordinate.
 */
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.location",
].join(",");

/** Google returns up to 20; we persist the visible local-pack depth per point. */
const RESULTS_PER_POINT = 10;

export interface GridCoordinate {
  row: number;
  col: number;
  latitude: number;
  longitude: number;
}

export function calculateGridCoordinates(input: {
  latitude: number;
  longitude: number;
  gridSize: 3 | 5;
  radiusKm: number;
}): GridCoordinate[] {
  const { latitude, longitude, gridSize, radiusKm } = input;
  const middle = (gridSize - 1) / 2;
  const longitudeKm = Math.max(1, 111.32 * Math.cos((latitude * Math.PI) / 180));
  const points: GridCoordinate[] = [];
  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const northKm = ((middle - row) / middle) * radiusKm;
      const eastKm = ((col - middle) / middle) * radiusKm;
      points.push({
        row,
        col,
        latitude: latitude + northKm / 110.574,
        longitude: longitude + eastKm / longitudeKm,
      });
    }
  }
  return points;
}

/** The subset of the Places `searchText` payload our field mask asks for. */
export interface PlacesTextSearchPayload {
  places?: Array<{
    id?: string;
    displayName?: { text?: string; languageCode?: string };
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    location?: { latitude?: number; longitude?: number };
  }> | null;
}

/**
 * Turn one Places response into (a) our own 1-based rank across the full result
 * set and (b) the top competitors actually returned at that coordinate.
 * Exported so the parsing contract is unit-testable without a network call.
 */
export function extractPointResults(
  payload: PlacesTextSearchPayload | null | undefined,
  placeId: string,
  limit: number = RESULTS_PER_POINT,
): { rank: number | null; results: RankGridResult[] } {
  const places = Array.isArray(payload?.places) ? payload.places : [];
  let rank: number | null = null;
  const results: RankGridResult[] = [];
  places.forEach((place, index) => {
    const position = index + 1;
    const id = typeof place?.id === "string" ? place.id : "";
    if (!id) return;
    if (rank === null && id === placeId) rank = position;
    if (results.length >= limit) return;
    const name = place?.displayName?.text?.trim();
    const address = place?.formattedAddress?.trim();
    results.push({
      placeId: id,
      name: name && name.length > 0 ? name : "Unnamed business",
      position,
      ...(address ? { address } : {}),
      ...(typeof place?.rating === "number" ? { rating: place.rating } : {}),
      ...(typeof place?.userRatingCount === "number"
        ? { reviewCount: place.userRatingCount }
        : {}),
      ...(typeof place?.location?.latitude === "number"
        ? { latitude: place.location.latitude }
        : {}),
      ...(typeof place?.location?.longitude === "number"
        ? { longitude: place.location.longitude }
        : {}),
    });
  });
  return { rank, results };
}

type PointOutcome =
  | { ok: true; rank: number | null; results: RankGridResult[] }
  | { ok: false; error: string };

async function rankAtPoint(input: {
  apiKey: string;
  placeId: string;
  keyword: string;
  coordinate: GridCoordinate;
  biasRadiusMeters: number;
  region: "US" | "CA";
}): Promise<PointOutcome> {
  try {
    const response = await fetch(SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": input.apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: input.keyword,
        pageSize: 20,
        rankPreference: "RELEVANCE",
        regionCode: input.region,
        locationBias: {
          circle: {
            center: {
              latitude: input.coordinate.latitude,
              longitude: input.coordinate.longitude,
            },
            radius: input.biasRadiusMeters,
          },
        },
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Google Places returned ${response.status}: ${body.slice(0, 180)}`,
      };
    }
    const payload = (await response.json()) as PlacesTextSearchPayload;
    const { rank, results } = extractPointResults(payload, input.placeId);
    return { ok: true, rank, results };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not reach Google Places",
    };
  }
}

export type RankGridScanOutcome =
  | { ok: true; points: RankGridPoint[]; failedPoints: number; firstError?: string }
  | { ok: false; error: string };

export async function scanGooglePlacesRankGrid(input: {
  placeId: string;
  keyword: string;
  latitude: number;
  longitude: number;
  gridSize: 3 | 5;
  radiusKm: number;
  region: "US" | "CA";
}): Promise<RankGridScanOutcome> {
  const apiKey = googleMapsApiKey();
  if (!apiKey) return { ok: false, error: "GOOGLE_MAPS_API_KEY is not configured." };
  const coordinates = calculateGridCoordinates(input);
  const points: RankGridPoint[] = [];
  const biasRadiusMeters = Math.max(500, Math.min(5_000, (input.radiusKm * 1_000) / 2));
  let failedPoints = 0;
  let firstError: string | undefined;

  // Small batches protect the Places quota while keeping a 25-point scan
  // responsive. A single bad coordinate is recorded as "no data" rather than
  // aborting — one 4xx used to throw away every check already paid for.
  for (let offset = 0; offset < coordinates.length; offset += 5) {
    const batch = coordinates.slice(offset, offset + 5);
    const results = await Promise.all(
      batch.map((coordinate) =>
        rankAtPoint({ ...input, apiKey, coordinate, biasRadiusMeters }),
      ),
    );
    batch.forEach((coordinate, index) => {
      const result = results[index];
      if (!result || !result.ok) {
        failedPoints += 1;
        if (!firstError) firstError = result ? result.error : "Google Places returned no response.";
        points.push({ ...coordinate, rank: null, results: [], unavailable: true });
        return;
      }
      points.push({ ...coordinate, rank: result.rank, results: result.results });
    });
  }

  // Only a total wipe-out is a scan failure — a partial grid is still useful.
  if (points.length > 0 && failedPoints === points.length) {
    return { ok: false, error: firstError ?? "Every Google Places check failed." };
  }
  return { ok: true, points, failedPoints, ...(firstError ? { firstError } : {}) };
}
