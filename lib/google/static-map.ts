/**
 * Web Mercator projection + Google Static Maps URL building.
 *
 * Pure functions with no network and no `server-only` guard, so the same maths
 * that positions a marker on the server can be unit-tested and re-used by the
 * client overlay. Getting this wrong is silent — pins simply land in the wrong
 * street — so every step here is the standard spherical Mercator used by Google,
 * OSM and every XYZ tile scheme, and is covered by tests.
 */

/** Tile edge in pixels at zoom 0. The constant the whole scheme is defined on. */
export const TILE_SIZE = 256;

/** Google Static Maps refuses a size above 640 per axis; `scale=2` buys detail. */
export const MAX_STATIC_MAP_PX = 640;

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Project to normalised world coordinates in the unit square, y increasing
 * southward. Latitude is clamped to the Mercator limit (±85.05113°) because the
 * projection diverges at the poles.
 */
export function projectNormalized(point: LatLng): { x: number; y: number } {
  const lat = Math.max(-85.05112878, Math.min(85.05112878, point.latitude));
  const sinLat = Math.sin((lat * Math.PI) / 180);
  return {
    x: (point.longitude + 180) / 360,
    y: 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI),
  };
}

/**
 * Pixel offset of `point` from `center` on a map rendered at `zoom`, in CSS
 * pixels with the origin at the map's top-left corner.
 */
export function pixelOffset(input: {
  center: LatLng;
  point: LatLng;
  zoom: number;
  width: number;
  height: number;
}): { left: number; top: number } {
  const scale = TILE_SIZE * Math.pow(2, input.zoom);
  const c = projectNormalized(input.center);
  const p = projectNormalized(input.point);
  return {
    left: input.width / 2 + (p.x - c.x) * scale,
    top: input.height / 2 + (p.y - c.y) * scale,
  };
}

/**
 * Round a percentage to the precision a browser keeps in an inline style.
 *
 * Browsers re-serialise inline style values, so a raw `72.6029828537321%` comes
 * back out of the DOM as `72.603%` — React then sees the server HTML and the
 * client render disagree and logs a hydration mismatch. Rounding to the same
 * three decimals here makes the round trip lossless. The precision cost is
 * nil: 0.001% of a 560px map is under two thousandths of a pixel.
 */
export function stylePercent(value: number): string {
  return `${value.toFixed(3)}%`;
}

/**
 * The largest integer zoom at which `radiusKm` in every direction from `center`
 * still fits inside a `width`×`height` viewport, with `paddingPx` of breathing
 * room so edge markers are not clipped by the frame.
 */
export function fitZoom(input: {
  center: LatLng;
  radiusKm: number;
  width: number;
  height: number;
  paddingPx?: number;
  maxZoom?: number;
}): number {
  const padding = input.paddingPx ?? 48;
  const usableWidth = Math.max(32, input.width - padding * 2);
  const usableHeight = Math.max(32, input.height - padding * 2);
  // A degree of latitude is ~110.574 km everywhere; a degree of longitude
  // shrinks with the cosine of latitude, so the two axes are converted apart.
  const latDelta = input.radiusKm / 110.574;
  const lonDelta =
    input.radiusKm /
    Math.max(1, 111.32 * Math.cos((input.center.latitude * Math.PI) / 180));
  const north = projectNormalized({
    latitude: input.center.latitude + latDelta,
    longitude: input.center.longitude,
  });
  const south = projectNormalized({
    latitude: input.center.latitude - latDelta,
    longitude: input.center.longitude,
  });
  const spanX = (lonDelta * 2) / 360;
  const spanY = Math.abs(south.y - north.y);
  const zoomX = Math.log2(usableWidth / (TILE_SIZE * Math.max(spanX, 1e-9)));
  const zoomY = Math.log2(usableHeight / (TILE_SIZE * Math.max(spanY, 1e-9)));
  const zoom = Math.floor(Math.min(zoomX, zoomY));
  return Math.max(1, Math.min(input.maxZoom ?? 20, zoom));
}

/**
 * Build the Google Static Maps URL for a clean, label-only basemap.
 *
 * Deliberately carries no markers: every pin is drawn as real DOM on top, so it
 * can be focused, hovered and described to a screen reader. The styling strips
 * Google's own business POIs — leaving them on would put competitor pins on the
 * map that our scan never measured, which reads as data when it is not.
 */
export function staticMapUrl(input: {
  apiKey: string;
  center: LatLng;
  zoom: number;
  width: number;
  height: number;
  scale?: 1 | 2;
  language?: string;
}): string {
  const params = new URLSearchParams({
    center: `${input.center.latitude},${input.center.longitude}`,
    zoom: String(input.zoom),
    size: `${Math.min(MAX_STATIC_MAP_PX, Math.round(input.width))}x${Math.min(
      MAX_STATIC_MAP_PX,
      Math.round(input.height),
    )}`,
    scale: String(input.scale ?? 2),
    format: "png",
    maptype: "roadmap",
    language: input.language ?? "en",
    key: input.apiKey,
  });
  // Mute the basemap so our own rank colours carry the meaning.
  for (const style of [
    "feature:poi|visibility:off",
    "feature:transit|visibility:off",
    "feature:road|element:labels.icon|visibility:off",
    "feature:administrative|element:geometry|visibility:off",
    "feature:landscape|color:0xf6f7f9",
    "feature:water|color:0xdfe7f2",
  ]) {
    params.append("style", style);
  }
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}
