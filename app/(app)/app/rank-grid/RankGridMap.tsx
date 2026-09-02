"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { intensityFill } from "@/components/charts/tokens";
import { fitZoom, pixelOffset, stylePercent } from "@/lib/google/static-map";
import { COMPASS_LABEL, displacement, type CompetitorInsight } from "@/lib/google/rank-insights";
import type { RankGridPoint, RankGridResult, RankGridScan } from "@/lib/data/types";

/**
 * The Rank Grid on a real map.
 *
 * The old "Map" toggle rendered an abstract lattice of squares with no
 * geography at all — an owner could not tell which side of town a weak point
 * was on. Here every point sits at its true coordinate over a Google basemap,
 * and the competitors the scan actually recorded are pinned at their own
 * addresses, so "who is beating me, and where do they trade from" is one look.
 *
 * The basemap is rendered at a fixed 640×640 logical frame and stretched by CSS,
 * so overlay positions are expressed as percentages and stay correct at any
 * container width without measuring the DOM.
 */

/** Logical frame the basemap and all overlay maths are computed in. */
const FRAME = 640;
/** Keeps edge markers clear of the frame. */
const PADDING = 64;

function rankIntensity(rank: number): number {
  const clamped = Math.min(20, Math.max(1, rank));
  return Math.max(0.12, 1 - (clamped - 1) / 19);
}

function rankLabel(rank: number | null): string {
  return rank === null ? "20+" : String(rank);
}

function ratingLabel(item: { rating?: number; reviewCount?: number }): string | null {
  if (item.rating === undefined && item.reviewCount === undefined) return null;
  const rating = item.rating === undefined ? "—" : item.rating.toFixed(1);
  if (item.reviewCount === undefined) return rating;
  return `${rating} ★ · ${item.reviewCount.toLocaleString()} reviews`;
}

interface Placed {
  left: number;
  top: number;
  /** False when the marker falls outside the rendered frame. */
  visible: boolean;
}

export function RankGridMap({
  scan,
  competitors,
  businessName,
  businessPlaceId,
  selected,
  onSelect,
}: {
  scan: RankGridScan;
  competitors: CompetitorInsight[];
  businessName?: string;
  businessPlaceId?: string;
  selected: { row: number; col: number };
  onSelect: (cell: { row: number; col: number }) => void;
}) {
  const [showCompetitors, setShowCompetitors] = useState(true);
  const [basemapFailed, setBasemapFailed] = useState(false);

  const center = scan.center;
  const points = useMemo(() => scan.points ?? [], [scan.points]);
  const radiusKm = scan.radiusKm ?? 2;

  const ownName = (businessName ?? "").trim().toLowerCase();
  const isOwn = useMemo(() => {
    return (result: RankGridResult) => {
      if (businessPlaceId && result.placeId === businessPlaceId) return true;
      return ownName.length > 0 && result.name.trim().toLowerCase() === ownName;
    };
  }, [businessPlaceId, ownName]);

  const zoom = useMemo(() => {
    if (!center) return 13;
    return fitZoom({
      center,
      radiusKm,
      width: FRAME,
      height: FRAME,
      paddingPx: PADDING,
    });
  }, [center, radiusKm]);

  const place = useMemo(() => {
    return (target: { latitude: number; longitude: number }): Placed => {
      if (!center) return { left: 50, top: 50, visible: false };
      const { left, top } = pixelOffset({
        center,
        point: target,
        zoom,
        width: FRAME,
        height: FRAME,
      });
      return {
        left: (left / FRAME) * 100,
        top: (top / FRAME) * 100,
        visible: left >= 0 && left <= FRAME && top >= 0 && top <= FRAME,
      };
    };
  }, [center, zoom]);

  const basemapSrc = center
    ? `/api/rank-grid/basemap?lat=${center.latitude}&lng=${center.longitude}&zoom=${zoom}&w=${FRAME}&h=${FRAME}`
    : null;

  // Competitors worth pinning: ones we know a coordinate for that actually beat
  // us somewhere. Pinning every result would bury the signal under ten identical
  // dots per point.
  const pinnedCompetitors = useMemo(
    () =>
      competitors
        .filter((c) => c.latitude !== undefined && c.longitude !== undefined && c.outranks > 0)
        .slice(0, 12)
        .map((c) => ({
          competitor: c,
          placed: place({ latitude: c.latitude as number, longitude: c.longitude as number }),
        }))
        .filter((entry) => entry.placed.visible),
    [competitors, place],
  );

  const selectedPoint =
    points.find((p) => p.row === selected.row && p.col === selected.col) ?? null;

  if (!center) {
    return (
      <div className="rounded-card border border-hairline bg-paper p-6 text-center">
        <Icon name="map-pin" size={20} className="mx-auto text-faint" />
        <p className="mt-2 text-[14px] font-semibold text-ink">No coordinates on this scan</p>
        <p className="mt-1 text-[13px] text-sub">
          Scans run before the map was added stored ranks without their positions. Re-run the scan to
          place it on a map.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowCompetitors((v) => !v)}
          aria-pressed={showCompetitors}
          className={cn(
            "inline-flex min-h-[34px] items-center gap-1.5 rounded-chip border px-2.5 py-1 text-[12px] font-semibold",
            showCompetitors
              ? "border-ink bg-ink text-white"
              : "border-hairline bg-card text-sub",
          )}
        >
          <Icon name="building" size={14} />
          {pinnedCompetitors.length} competitors
        </button>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-faint">
          <span className="inline-flex items-center gap-1">
            <span className="size-3 rounded-full ring-2 ring-ink" style={{ backgroundColor: intensityFill(1) }} />
            You
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-3 rounded-full bg-danger-tint ring-1 ring-danger/40" /> Not ranking
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-3 rounded-full border-2 border-white bg-ink shadow-sm" /> Competitor
          </span>
        </div>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-[560px] overflow-hidden rounded-card border border-hairline bg-primary-wash/40">
        {basemapSrc && !basemapFailed ? (
          /* A proxied Static Maps PNG: next/image would re-optimise a
             same-origin binary we already cache, for no gain. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={basemapSrc}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 size-full object-cover"
            onError={() => setBasemapFailed(true)}
          />
        ) : null}

        {basemapFailed ? (
          <div className="absolute inset-x-0 top-0 z-20 bg-gold-wash px-3 py-1.5 text-center text-[11px] text-sub">
            Basemap unavailable — points are still plotted to scale.
          </div>
        ) : null}

        {/* Scan radius ring: the area the scan actually covered, so nothing
            outside it is mistaken for measured ground. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full border-2 border-dashed border-ink/20"
          style={{
            left: stylePercent((PADDING / FRAME) * 100),
            top: stylePercent((PADDING / FRAME) * 100),
            width: stylePercent((((FRAME / 2 - PADDING) * 2) / FRAME) * 100),
            height: stylePercent((((FRAME / 2 - PADDING) * 2) / FRAME) * 100),
          }}
        />

        {/* Competitor pins sit under the grid points — our own ranking is the
            subject of the page, theirs is context. */}
        {showCompetitors
          ? pinnedCompetitors.map(({ competitor, placed }) => (
              <div
                key={competitor.key}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: stylePercent(placed.left), top: stylePercent(placed.top) }}
              >
                <span
                  className="block size-3.5 rounded-full border-2 border-white bg-ink shadow-md"
                  title={`${competitor.name}${
                    ratingLabel(competitor) ? ` — ${ratingLabel(competitor)}` : ""
                  } · outranks you at ${competitor.outranks} point${competitor.outranks === 1 ? "" : "s"}`}
                />
              </div>
            ))
          : null}

        {/* Grid points at their true coordinates. */}
        {points.map((point) => {
          if (point.latitude === undefined || point.longitude === undefined) return null;
          const placed = place({ latitude: point.latitude, longitude: point.longitude });
          const active = selected.row === point.row && selected.col === point.col;
          const unavailable = Boolean(point.unavailable);
          const missing = !unavailable && point.rank === null;
          const t = point.rank === null ? 0 : rankIntensity(point.rank);
          const offset = displacement(center, {
            latitude: point.latitude,
            longitude: point.longitude,
          });
          return (
            <button
              type="button"
              key={`${point.row}-${point.col}`}
              onClick={() => onSelect({ row: point.row, col: point.col })}
              aria-pressed={active}
              className={cn(
                "absolute z-20 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[12px] font-bold tabular-nums shadow-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1",
                unavailable
                  ? "border border-dashed border-hairline bg-paper text-faint"
                  : missing
                    ? "border border-danger/40 bg-danger-tint text-danger"
                    : t >= 0.5
                      ? "text-white"
                      : "text-primary-dark",
                active && "ring-2 ring-ink ring-offset-1",
              )}
              style={{
                left: stylePercent(placed.left),
                top: stylePercent(placed.top),
                ...(missing || unavailable ? {} : { backgroundColor: intensityFill(t) }),
              }}
              aria-label={
                unavailable
                  ? `Search point ${offset.km.toFixed(1)} km ${COMPASS_LABEL[offset.direction]}: not checked, Google did not respond`
                  : `Search point ${offset.km.toFixed(1)} km ${COMPASS_LABEL[offset.direction]} of your business: rank ${rankLabel(point.rank)}`
              }
              title={
                unavailable
                  ? "Not checked — Google did not respond here"
                  : `Rank ${rankLabel(point.rank)} · ${offset.km.toFixed(1)} km ${COMPASS_LABEL[offset.direction]}`
              }
            >
              {unavailable ? "–" : rankLabel(point.rank)}
            </button>
          );
        })}

        {/* Our own business, always on top. */}
        <div
          className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2"
          style={{ left: "50%", top: "50%" }}
        >
          <span className="grid size-5 place-items-center rounded-full bg-white shadow-md ring-2 ring-ink">
            <Icon name="map-pin" size={12} className="text-ink" />
          </span>
        </div>
      </div>

      <p className="mt-2.5 text-center text-[11px] text-faint">
        Each pin is a real search point around {businessName ?? "your business"}, placed at its true
        coordinate. The number is where you ranked there — denser green is higher. The dashed ring is
        the {radiusKm} km area the scan covered.
      </p>

      {selectedPoint ? (
        <SelectedPointCard
          point={selectedPoint}
          center={center}
          isOwn={isOwn}
        />
      ) : null}
    </div>
  );
}

function SelectedPointCard({
  point,
  center,
  isOwn,
}: {
  point: RankGridPoint;
  center: { latitude: number; longitude: number };
  isOwn: (result: RankGridResult) => boolean;
}) {
  const results = point.results ?? [];
  const offset =
    point.latitude !== undefined && point.longitude !== undefined
      ? displacement(center, { latitude: point.latitude, longitude: point.longitude })
      : null;

  return (
    <div className="mt-3 rounded-card border border-hairline bg-card p-3">
      <div className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
        <Icon name="compass" size={14} className="text-sub" />
        {offset
          ? offset.km < 0.05
            ? "At your business"
            : `${offset.km.toFixed(1)} km ${COMPASS_LABEL[offset.direction]} of your business`
          : "Selected search point"}
      </div>
      {point.unavailable ? (
        <p className="mt-1.5 text-[13px] text-sub">
          Google did not respond for this point, so there is no ranking to report here. This is not a
          ranking loss — it was never measured.
        </p>
      ) : results.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-sub">
          This scan stored the ranking here but not the businesses. Re-run the scan to capture who
          appears at this point.
        </p>
      ) : (
        <ol className="mt-2 space-y-1">
          {results.slice(0, 5).map((result) => (
            <li
              key={`${result.placeId}-${result.position}`}
              className={cn(
                "flex items-baseline gap-2 text-[13px]",
                isOwn(result) ? "font-semibold text-primary-dark" : "text-sub",
              )}
            >
              <span className="w-5 shrink-0 tabular-nums text-faint">{result.position}.</span>
              <span className="min-w-0 flex-1 truncate">{result.name}</span>
              {ratingLabel(result) ? (
                <span className="shrink-0 text-[12px] tabular-nums text-faint">
                  {ratingLabel(result)}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
