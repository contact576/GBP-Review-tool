import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateGridCoordinates,
  extractPointResults,
  scanGooglePlacesRankGrid,
  type PlacesTextSearchPayload,
} from "../rank-grid";

describe("rank grid coordinates", () => {
  it("creates a stable 3 by 3 grid around the center", () => {
    const points = calculateGridCoordinates({
      latitude: 43.6532,
      longitude: -79.3832,
      gridSize: 3,
      radiusKm: 2,
    });
    expect(points).toHaveLength(9);
    expect(points[4]).toMatchObject({
      row: 1,
      col: 1,
      latitude: 43.6532,
      longitude: -79.3832,
    });
    expect(points[0]!.latitude).toBeGreaterThan(points[8]!.latitude);
    expect(points[0]!.longitude).toBeLessThan(points[2]!.longitude);
  });

  it("creates all 25 unique five by five points", () => {
    const points = calculateGridCoordinates({
      latitude: 40.7128,
      longitude: -74.006,
      gridSize: 5,
      radiusKm: 5,
    });
    expect(points).toHaveLength(25);
    expect(new Set(points.map((point) => `${point.latitude}:${point.longitude}`)).size).toBe(25);
  });
});

function place(id: string, name: string, extra: Record<string, unknown> = {}) {
  return { id, displayName: { text: name, languageCode: "en" }, ...extra };
}

describe("extractPointResults", () => {
  it("captures the competitors alongside our own rank", () => {
    const payload: PlacesTextSearchPayload = {
      places: [
        place("comp_a", "Northside Physio", {
          formattedAddress: "12 King St",
          rating: 4.8,
          userRatingCount: 210,
          location: { latitude: 43.65, longitude: -79.38 },
        }),
        place("us", "Foundly Clinic"),
        place("comp_b", "Oakview Physio", { rating: 4.2 }),
      ],
    };
    const { rank, results } = extractPointResults(payload, "us");
    expect(rank).toBe(2);
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      placeId: "comp_a",
      name: "Northside Physio",
      position: 1,
      address: "12 King St",
      rating: 4.8,
      reviewCount: 210,
      latitude: 43.65,
      longitude: -79.38,
    });
    expect(results[1]).toMatchObject({ placeId: "us", name: "Foundly Clinic", position: 2 });
    // Optional fields are omitted rather than stored as nulls.
    expect(results[2]).toEqual({
      placeId: "comp_b",
      name: "Oakview Physio",
      position: 3,
      rating: 4.2,
    });
  });

  it("keeps only the top ten results but still ranks beyond them", () => {
    const payload: PlacesTextSearchPayload = {
      places: Array.from({ length: 20 }, (_, index) =>
        index === 14 ? place("us", "Foundly Clinic") : place(`comp_${index}`, `Competitor ${index}`),
      ),
    };
    const { rank, results } = extractPointResults(payload, "us");
    expect(rank).toBe(15);
    expect(results).toHaveLength(10);
    expect(results.at(-1)?.position).toBe(10);
  });

  it("returns a null rank and an empty list for an empty or malformed payload", () => {
    expect(extractPointResults({ places: [] }, "us")).toEqual({ rank: null, results: [] });
    expect(extractPointResults({}, "us")).toEqual({ rank: null, results: [] });
    expect(extractPointResults(null, "us")).toEqual({ rank: null, results: [] });
    expect(extractPointResults({ places: null }, "us")).toEqual({ rank: null, results: [] });
  });

  it("skips entries with no place id and falls back for a missing name", () => {
    const payload: PlacesTextSearchPayload = {
      places: [{ displayName: { text: "Ghost" } }, place("comp_a", "   "), place("us", "Us")],
    };
    const { rank, results } = extractPointResults(payload, "us");
    expect(rank).toBe(3);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ placeId: "comp_a", name: "Unnamed business", position: 2 });
  });
});

describe("scanGooglePlacesRankGrid", () => {
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;

  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalKey;
  });

  function okResponse(payload: PlacesTextSearchPayload) {
    return { ok: true, status: 200, json: async () => payload } as unknown as Response;
  }

  const scanInput = {
    placeId: "us",
    keyword: "physio near me",
    latitude: 43.6532,
    longitude: -79.3832,
    gridSize: 3 as const,
    radiusKm: 3,
    region: "CA" as const,
  };

  it("attaches the captured businesses to every grid point", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        okResponse({ places: [place("comp_a", "Northside Physio"), place("us", "Foundly Clinic")] }),
      ),
    );
    const result = await scanGooglePlacesRankGrid(scanInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points).toHaveLength(9);
    expect(result.failedPoints).toBe(0);
    expect(result.points.every((point) => point.rank === 2)).toBe(true);
    expect(result.points[0]?.results).toHaveLength(2);
    expect(result.points[0]?.results?.[0]).toMatchObject({ name: "Northside Physio", position: 1 });
  });

  it("records a failed point instead of aborting the whole scan", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 2) {
          return {
            ok: false,
            status: 400,
            text: async () => "INVALID_ARGUMENT",
          } as unknown as Response;
        }
        return okResponse({ places: [place("us", "Foundly Clinic")] });
      }),
    );
    const result = await scanGooglePlacesRankGrid(scanInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points).toHaveLength(9);
    expect(result.failedPoints).toBe(1);
    expect(result.firstError).toContain("400");
    const failed = result.points.filter((point) => point.rank === null);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.results).toEqual([]);
    // The other eight points still carry usable data.
    expect(result.points.filter((point) => (point.results?.length ?? 0) > 0)).toHaveLength(8);
  });

  it("only fails the scan when every point fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const result = await scanGooglePlacesRankGrid(scanInput);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("network down");
  });

  it("fails fast when the API key is missing", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const result = await scanGooglePlacesRankGrid(scanInput);
    expect(result).toEqual({ ok: false, error: "GOOGLE_MAPS_API_KEY is not configured." });
  });
});
