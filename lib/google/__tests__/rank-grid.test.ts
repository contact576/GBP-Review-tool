import { describe, expect, it } from "vitest";
import { calculateGridCoordinates } from "../rank-grid";

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
