import { describe, expect, it } from "vitest";
import {
  TILE_SIZE,
  fitZoom,
  pixelOffset,
  projectNormalized,
  staticMapUrl,
} from "../static-map";

describe("web mercator projection", () => {
  it("puts the null island at the centre of the unit square", () => {
    const point = projectNormalized({ latitude: 0, longitude: 0 });
    expect(point.x).toBeCloseTo(0.5, 10);
    expect(point.y).toBeCloseTo(0.5, 10);
  });

  it("increases y southward and x eastward", () => {
    const north = projectNormalized({ latitude: 40, longitude: 0 });
    const south = projectNormalized({ latitude: -40, longitude: 0 });
    const east = projectNormalized({ latitude: 0, longitude: 40 });
    const west = projectNormalized({ latitude: 0, longitude: -40 });
    expect(north.y).toBeLessThan(south.y);
    expect(east.x).toBeGreaterThan(west.x);
  });

  it("clamps beyond the mercator limit instead of diverging to infinity", () => {
    const pole = projectNormalized({ latitude: 90, longitude: 0 });
    expect(Number.isFinite(pole.y)).toBe(true);
    expect(pole.y).toBeCloseTo(0, 6);
  });
});

describe("pixelOffset", () => {
  const center = { latitude: 43.6532, longitude: -79.3832 };

  it("places the centre at the middle of the frame", () => {
    const offset = pixelOffset({ center, point: center, zoom: 13, width: 640, height: 640 });
    expect(offset.left).toBeCloseTo(320, 10);
    expect(offset.top).toBeCloseTo(320, 10);
  });

  it("places a point north-east of centre up and to the right", () => {
    const offset = pixelOffset({
      center,
      point: { latitude: center.latitude + 0.01, longitude: center.longitude + 0.01 },
      zoom: 13,
      width: 640,
      height: 640,
    });
    expect(offset.left).toBeGreaterThan(320);
    expect(offset.top).toBeLessThan(320);
  });

  it("doubles the pixel displacement for each zoom level", () => {
    const point = { latitude: center.latitude + 0.01, longitude: center.longitude };
    const near = pixelOffset({ center, point, zoom: 12, width: 640, height: 640 });
    const far = pixelOffset({ center, point, zoom: 13, width: 640, height: 640 });
    expect(320 - far.top).toBeCloseTo((320 - near.top) * 2, 6);
  });
});

describe("fitZoom", () => {
  const center = { latitude: 43.6532, longitude: -79.3832 };

  it("keeps every point of the scan radius inside the padded frame", () => {
    for (const radiusKm of [0.5, 2, 5, 15]) {
      const zoom = fitZoom({ center, radiusKm, width: 640, height: 640, paddingPx: 64 });
      const latDelta = radiusKm / 110.574;
      const corner = pixelOffset({
        center,
        point: { latitude: center.latitude + latDelta, longitude: center.longitude },
        zoom,
        width: 640,
        height: 640,
      });
      expect(corner.top).toBeGreaterThanOrEqual(0);
      expect(corner.top).toBeLessThanOrEqual(640);
    }
  });

  it("zooms further out for a wider scan", () => {
    const tight = fitZoom({ center, radiusKm: 1, width: 640, height: 640 });
    const wide = fitZoom({ center, radiusKm: 10, width: 640, height: 640 });
    expect(wide).toBeLessThan(tight);
  });

  it("stays inside Google's supported zoom range", () => {
    const absurd = fitZoom({ center, radiusKm: 20_000, width: 640, height: 640 });
    const microscopic = fitZoom({ center, radiusKm: 0.0001, width: 640, height: 640 });
    expect(absurd).toBeGreaterThanOrEqual(1);
    expect(microscopic).toBeLessThanOrEqual(20);
  });

  it("is defined against the standard 256px tile", () => {
    expect(TILE_SIZE).toBe(256);
  });
});

describe("staticMapUrl", () => {
  const base = {
    apiKey: "test-key",
    center: { latitude: 43.6532, longitude: -79.3832 },
    zoom: 13,
    width: 640,
    height: 640,
  };

  it("builds a roadmap request carrying the key and centre", () => {
    const url = new URL(staticMapUrl(base));
    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/staticmap");
    expect(url.searchParams.get("key")).toBe("test-key");
    expect(url.searchParams.get("center")).toBe("43.6532,-79.3832");
    expect(url.searchParams.get("zoom")).toBe("13");
    expect(url.searchParams.get("maptype")).toBe("roadmap");
  });

  it("never asks for a size Google will reject", () => {
    const url = new URL(staticMapUrl({ ...base, width: 5000, height: 5000 }));
    expect(url.searchParams.get("size")).toBe("640x640");
  });

  it("turns off Google's own business pins so only measured results are shown", () => {
    const url = new URL(staticMapUrl(base));
    expect(url.searchParams.getAll("style")).toContain("feature:poi|visibility:off");
  });

  it("carries no markers — every pin is drawn as real DOM on top", () => {
    const url = new URL(staticMapUrl(base));
    expect(url.searchParams.get("markers")).toBeNull();
  });
});
