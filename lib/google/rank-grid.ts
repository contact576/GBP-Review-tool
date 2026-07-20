import "server-only";
import { googleMapsApiKey } from "./config";
import type { RankGridPoint } from "@/lib/data/types";

const SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

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

type RankResult =
  | { ok: true; rank: number | null }
  | { ok: false; error: string };

async function rankAtPoint(input: {
  apiKey: string;
  placeId: string;
  keyword: string;
  coordinate: GridCoordinate;
  biasRadiusMeters: number;
  region: "US" | "CA";
}): Promise<RankResult> {
  try {
    const response = await fetch(SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": input.apiKey,
        "X-Goog-FieldMask": "places.id",
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
    const payload = (await response.json()) as { places?: Array<{ id?: string }> };
    const index = (payload.places ?? []).findIndex((place) => place.id === input.placeId);
    return { ok: true, rank: index >= 0 ? index + 1 : null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not reach Google Places",
    };
  }
}

export async function scanGooglePlacesRankGrid(input: {
  placeId: string;
  keyword: string;
  latitude: number;
  longitude: number;
  gridSize: 3 | 5;
  radiusKm: number;
  region: "US" | "CA";
}): Promise<{ ok: true; points: RankGridPoint[] } | { ok: false; error: string }> {
  const apiKey = googleMapsApiKey();
  if (!apiKey) return { ok: false, error: "GOOGLE_MAPS_API_KEY is not configured." };
  const coordinates = calculateGridCoordinates(input);
  const points: RankGridPoint[] = [];
  const biasRadiusMeters = Math.max(500, Math.min(5_000, (input.radiusKm * 1_000) / 2));

  // Small batches protect the Places quota while keeping a 25-point scan responsive.
  for (let offset = 0; offset < coordinates.length; offset += 5) {
    const batch = coordinates.slice(offset, offset + 5);
    const results = await Promise.all(
      batch.map((coordinate) =>
        rankAtPoint({ ...input, apiKey, coordinate, biasRadiusMeters }),
      ),
    );
    const failure = results.find((result) => !result.ok);
    if (failure && !failure.ok) return { ok: false, error: failure.error };
    batch.forEach((coordinate, index) => {
      const result = results[index];
      points.push({
        ...coordinate,
        rank: result?.ok ? result.rank : null,
      });
    });
  }
  return { ok: true, points };
}
