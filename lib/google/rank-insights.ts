import type { RankGridPoint, RankGridResult, RankGridScan } from "@/lib/data/types";

/**
 * Reading a rank grid, rather than just colouring it.
 *
 * The grid already knew *where* the business ranks. None of it answered the
 * three questions an owner actually asks next — who is beating me, why, and
 * how far out does my visibility survive. Every figure below is derived from
 * results the scan already stored, so nothing here is an estimate: if the scan
 * did not measure something, the field is absent rather than invented.
 *
 * Pure and side-effect free so the whole reading is unit-testable.
 */

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Compass = (typeof COMPASS)[number];

export const COMPASS_LABEL: Record<Compass, string> = {
  N: "north",
  NE: "north-east",
  E: "east",
  SE: "south-east",
  S: "south",
  SW: "south-west",
  W: "west",
  NW: "north-west",
};

/** Rank used for averaging when the business did not appear at all. */
const ABSENT_RANK = 21;

export interface Displacement {
  km: number;
  direction: Compass;
}

/** Kilometres and compass bearing from the scan centre to one grid point. */
export function displacement(
  center: { latitude: number; longitude: number },
  point: { latitude: number; longitude: number },
): Displacement {
  const northKm = (point.latitude - center.latitude) * 110.574;
  const eastKm =
    (point.longitude - center.longitude) *
    111.32 *
    Math.cos((center.latitude * Math.PI) / 180);
  const km = Math.sqrt(northKm * northKm + eastKm * eastKm);
  const angle = (Math.atan2(eastKm, northKm) * 180) / Math.PI;
  const direction = COMPASS[Math.round(((angle + 360) % 360) / 45) % 8] ?? "N";
  return { km, direction };
}

export interface CompetitorInsight {
  key: string;
  placeId?: string;
  name: string;
  address?: string;
  /** Grid points where this business appeared at all. */
  appearances: number;
  /** Grid points where it placed above us (or we were absent entirely). */
  outranks: number;
  /** `outranks` as a share of the points we could compare, 0–1. */
  outrankShare: number;
  bestPosition: number;
  averagePosition: number;
  rating?: number;
  reviewCount?: number;
  /** Their review count minus ours. Positive means they have more. */
  reviewGap?: number;
  ratingGap?: number;
  latitude?: number;
  longitude?: number;
}

export interface DistanceBand {
  label: string;
  /** Upper bound of the band, in km. */
  maxKm: number;
  points: number;
  averageRank: number | null;
  top3: number;
}

export interface DirectionInsight {
  direction: Compass;
  label: string;
  points: number;
  averageRank: number;
  top3: number;
}

export interface RankGridInsights {
  checked: number;
  unavailable: number;
  top3: number;
  top10: number;
  absent: number;
  averageRank: number | null;
  /** Our own listing as the scan saw it, when it appeared anywhere. */
  own?: { rating?: number; reviewCount?: number };
  competitors: CompetitorInsight[];
  distanceBands: DistanceBand[];
  directions: DirectionInsight[];
  weakest?: DirectionInsight;
  strongest?: DirectionInsight;
  /** Furthest distance at which we still held a top-3 place, in km. */
  top3ReachKm: number | null;
}

function isOwnResult(
  result: RankGridResult,
  ownPlaceId: string | undefined,
  ownName: string,
): boolean {
  if (ownPlaceId && result.placeId === ownPlaceId) return true;
  return ownName.length > 0 && result.name.trim().toLowerCase() === ownName;
}

/**
 * Bucket the grid by distance from the centre. Bands are derived from the scan
 * radius rather than fixed, so a 1 km scan and a 15 km scan both split sensibly.
 */
function buildDistanceBands(
  entries: Array<{ point: RankGridPoint; km: number }>,
  radiusKm: number,
): DistanceBand[] {
  const edges = [radiusKm / 3, (radiusKm * 2) / 3, radiusKm * 1.5];
  const labels = ["Closest ring", "Middle ring", "Outer ring"];
  return edges.map((maxKm, index) => {
    const min = index === 0 ? -1 : edges[index - 1]!;
    const inBand = entries.filter((entry) => entry.km > min && entry.km <= maxKm);
    const ranked = inBand.filter((entry) => !entry.point.unavailable);
    const averageRank =
      ranked.length === 0
        ? null
        : ranked.reduce((sum, entry) => sum + (entry.point.rank ?? ABSENT_RANK), 0) /
          ranked.length;
    return {
      label: labels[index]!,
      maxKm,
      points: inBand.length,
      averageRank,
      top3: inBand.filter((entry) => entry.point.rank !== null && entry.point.rank <= 3).length,
    };
  });
}

export function buildRankGridInsights(input: {
  scan: RankGridScan;
  businessName?: string;
  businessPlaceId?: string;
}): RankGridInsights {
  const points = input.scan.points ?? [];
  const center = input.scan.center;
  const ownName = (input.businessName ?? "").trim().toLowerCase();
  const ownPlaceId = input.businessPlaceId;

  const checkedPoints = points.filter((point) => !point.unavailable);
  const unavailable = points.length - checkedPoints.length;
  const top3 = checkedPoints.filter((p) => p.rank !== null && p.rank <= 3).length;
  const top10 = checkedPoints.filter((p) => p.rank !== null && p.rank <= 10).length;
  const absent = checkedPoints.filter((p) => p.rank === null).length;
  const averageRank =
    checkedPoints.length === 0
      ? null
      : checkedPoints.reduce((sum, p) => sum + (p.rank ?? ABSENT_RANK), 0) / checkedPoints.length;

  // Our own rating/review count as Google reported it during this scan — more
  // trustworthy than the stored profile, which may be days stale.
  let own: { rating?: number; reviewCount?: number } | undefined;
  for (const point of points) {
    const mine = (point.results ?? []).find((r) => isOwnResult(r, ownPlaceId, ownName));
    if (mine && (mine.rating !== undefined || mine.reviewCount !== undefined)) {
      own = { rating: mine.rating, reviewCount: mine.reviewCount };
      break;
    }
  }

  // ── Competitors ──────────────────────────────────────────────
  const tally = new Map<
    string,
    CompetitorInsight & { positionSum: number; comparablePoints: number }
  >();
  let comparablePoints = 0;
  for (const point of points) {
    const results = point.results ?? [];
    if (results.length === 0) continue;
    comparablePoints += 1;
    const mine = results.find((r) => isOwnResult(r, ownPlaceId, ownName));
    const ownPosition = mine ? mine.position : Number.POSITIVE_INFINITY;
    for (const result of results) {
      if (isOwnResult(result, ownPlaceId, ownName)) continue;
      const key = result.placeId || result.name.trim().toLowerCase();
      const existing = tally.get(key);
      const row = existing ?? {
        key,
        placeId: result.placeId,
        name: result.name,
        address: result.address,
        appearances: 0,
        outranks: 0,
        outrankShare: 0,
        bestPosition: result.position,
        averagePosition: 0,
        rating: result.rating,
        reviewCount: result.reviewCount,
        latitude: result.latitude,
        longitude: result.longitude,
        positionSum: 0,
        comparablePoints: 0,
      };
      row.appearances += 1;
      row.positionSum += result.position;
      if (result.position < ownPosition) row.outranks += 1;
      row.bestPosition = Math.min(row.bestPosition, result.position);
      if (row.rating === undefined) row.rating = result.rating;
      if (row.reviewCount === undefined) row.reviewCount = result.reviewCount;
      if (row.latitude === undefined) row.latitude = result.latitude;
      if (row.longitude === undefined) row.longitude = result.longitude;
      if (row.address === undefined) row.address = result.address;
      tally.set(key, row);
    }
  }

  const competitors: CompetitorInsight[] = [...tally.values()]
    .map((row) => {
      const insight: CompetitorInsight = {
        key: row.key,
        placeId: row.placeId,
        name: row.name,
        address: row.address,
        appearances: row.appearances,
        outranks: row.outranks,
        outrankShare: comparablePoints === 0 ? 0 : row.outranks / comparablePoints,
        bestPosition: row.bestPosition,
        averagePosition: row.positionSum / row.appearances,
        rating: row.rating,
        reviewCount: row.reviewCount,
        latitude: row.latitude,
        longitude: row.longitude,
      };
      if (own?.reviewCount !== undefined && row.reviewCount !== undefined) {
        insight.reviewGap = row.reviewCount - own.reviewCount;
      }
      if (own?.rating !== undefined && row.rating !== undefined) {
        insight.ratingGap = Number((row.rating - own.rating).toFixed(2));
      }
      return insight;
    })
    .sort((a, b) => b.outranks - a.outranks || a.averagePosition - b.averagePosition);

  // ── Geography ────────────────────────────────────────────────
  const located = center
    ? points
        .filter(
          (point) => point.latitude !== undefined && point.longitude !== undefined,
        )
        .map((point) => ({
          point,
          ...displacement(center, {
            latitude: point.latitude as number,
            longitude: point.longitude as number,
          }),
        }))
    : [];

  const radiusKm = input.scan.radiusKm ?? Math.max(1, ...located.map((entry) => entry.km));
  const distanceBands = located.length > 0 ? buildDistanceBands(located, radiusKm) : [];

  const byDirection = new Map<Compass, { ranks: number[]; top3: number }>();
  for (const entry of located) {
    // The centre point has no direction; counting it would bias whichever
    // sector rounding happened to assign it.
    if (entry.km < 0.05 || entry.point.unavailable) continue;
    const bucket = byDirection.get(entry.direction) ?? { ranks: [], top3: 0 };
    bucket.ranks.push(entry.point.rank ?? ABSENT_RANK);
    if (entry.point.rank !== null && entry.point.rank <= 3) bucket.top3 += 1;
    byDirection.set(entry.direction, bucket);
  }
  const directions: DirectionInsight[] = [...byDirection.entries()]
    .map(([direction, bucket]) => ({
      direction,
      label: COMPASS_LABEL[direction],
      points: bucket.ranks.length,
      averageRank: bucket.ranks.reduce((a, b) => a + b, 0) / bucket.ranks.length,
      top3: bucket.top3,
    }))
    .sort((a, b) => a.averageRank - b.averageRank);

  const top3Distances = located
    .filter((entry) => entry.point.rank !== null && entry.point.rank <= 3)
    .map((entry) => entry.km);

  return {
    checked: checkedPoints.length,
    unavailable,
    top3,
    top10,
    absent,
    averageRank,
    own,
    competitors,
    distanceBands,
    directions,
    strongest: directions[0],
    weakest: directions[directions.length - 1],
    top3ReachKm: top3Distances.length === 0 ? null : Math.max(...top3Distances),
  };
}
