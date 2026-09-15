"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ds/misc";
import { intensityFill } from "@/components/charts/tokens";
import { buildRankGridInsights } from "@/lib/google/rank-insights";
import { RankGridMap } from "./RankGridMap";
import { RankGridInsightsPanel } from "./RankGridInsightsPanel";
import type { RankGridPoint, RankGridResult, RankGridScan } from "@/lib/data/types";

/**
 * Map a rank to a single-hue green intensity: rank 1 = densest, higher ranks
 * fade. Capped at a 20 domain. `null` ("not ranking") is NOT on this ramp — it
 * renders as a discrete, labelled danger marker (DESIGN §3 geo-grid rule).
 */
function rankIntensity(rank: number): number {
  const clamped = Math.min(20, Math.max(1, rank));
  return Math.max(0.12, 1 - (clamped - 1) / 19);
}

function cellLabel(rank: number | null): string {
  if (rank === null) return "20+";
  return String(rank);
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** Plain-language "where is this cell" without pulling in a map library. */
function offsetLabel(
  center: { latitude: number; longitude: number } | undefined,
  point: RankGridPoint,
): string | null {
  if (!center || point.latitude === undefined || point.longitude === undefined) return null;
  const northKm = (point.latitude - center.latitude) * 110.574;
  const eastKm =
    (point.longitude - center.longitude) * 111.32 * Math.cos((center.latitude * Math.PI) / 180);
  const km = Math.sqrt(northKm * northKm + eastKm * eastKm);
  if (km < 0.05) return "At your business";
  const angle = (Math.atan2(eastKm, northKm) * 180) / Math.PI;
  const direction = COMPASS[Math.round(((angle + 360) % 360) / 45) % 8] ?? "N";
  return `${km.toFixed(1)} km ${direction} of your business`;
}

function ratingLabel(result: { rating?: number; reviewCount?: number }): string | null {
  if (result.rating === undefined && result.reviewCount === undefined) return null;
  const rating = result.rating === undefined ? "—" : result.rating.toFixed(1);
  if (result.reviewCount === undefined) return rating;
  return `${rating} · ${result.reviewCount.toLocaleString()} reviews`;
}

interface CompetitorRow {
  key: string;
  name: string;
  /** Grid points where this business ranked above ours (or we were absent). */
  outranks: number;
  /** Grid points where this business showed up at all. */
  appearances: number;
  bestPosition: number;
  rating?: number;
  reviewCount?: number;
}

export function RankGridView({
  scan,
  businessName,
  businessPlaceId,
}: {
  scan: RankGridScan;
  businessName?: string;
  businessPlaceId?: string;
}) {
  // "map" leads: it is the only view that answers "where", which is the whole
  // point of a geo-grid. The lattice stays available for scanning ranks quickly.
  const [view, setView] = useState<"map" | "grid" | "table">("map");
  const size = scan.gridSize;
  const points = useMemo(() => scan.points ?? [], [scan.points]);
  const middle = Math.floor(size / 2);
  const [selected, setSelected] = useState<{ row: number; col: number }>({
    row: middle,
    col: middle,
  });

  const ownName = (businessName ?? "").trim().toLowerCase();
  const isOwn = useMemo(() => {
    return (result: RankGridResult) => {
      if (businessPlaceId && result.placeId === businessPlaceId) return true;
      return ownName.length > 0 && result.name.trim().toLowerCase() === ownName;
    };
  }, [businessPlaceId, ownName]);

  // Order points into rows/cols for a stable grid.
  const cellAt = (row: number, col: number) =>
    points.find((p) => p.row === row && p.col === col) ?? null;

  const withResults = points.filter((point) => (point.results?.length ?? 0) > 0);
  const hasResults = withResults.length > 0;

  const selectedPoint = cellAt(selected.row, selected.col);
  const selectedResults = selectedPoint?.results ?? [];
  const selectedOffset = selectedPoint ? offsetLabel(scan.center, selectedPoint) : null;

  // One reading of the scan, shared by the map (competitor pins) and the
  // explanation panel below it, so the two can never disagree.
  const insights = useMemo(
    () => buildRankGridInsights({ scan, businessName, businessPlaceId }),
    [scan, businessName, businessPlaceId],
  );

  const competitors = useMemo<CompetitorRow[]>(() => {
    const tally = new Map<string, CompetitorRow>();
    for (const point of points) {
      const results = point.results ?? [];
      if (results.length === 0) continue;
      const own = results.find((result) => isOwn(result));
      const ownPosition = own ? own.position : Number.POSITIVE_INFINITY;
      for (const result of results) {
        if (isOwn(result)) continue;
        const key = result.placeId || result.name.trim().toLowerCase();
        const row =
          tally.get(key) ??
          ({
            key,
            name: result.name,
            outranks: 0,
            appearances: 0,
            bestPosition: result.position,
            rating: result.rating,
            reviewCount: result.reviewCount,
          } satisfies CompetitorRow);
        row.appearances += 1;
        if (result.position < ownPosition) row.outranks += 1;
        row.bestPosition = Math.min(row.bestPosition, result.position);
        if (row.rating === undefined) row.rating = result.rating;
        if (row.reviewCount === undefined) row.reviewCount = result.reviewCount;
        tally.set(key, row);
      }
    }
    return [...tally.values()]
      .filter((row) => row.outranks > 0)
      .sort((a, b) => b.outranks - a.outranks || a.bestPosition - b.bestPosition)
      .slice(0, 8);
  }, [points, isOwn]);

  const backfillHint = (
    <p className="mt-3 flex items-start gap-1.5 rounded-btn border border-hairline bg-primary-wash/60 px-3 py-2 text-[13px] text-sub">
      <Icon name="alert" size={15} className="mt-px shrink-0 text-gold-deep" />
      Re-run the scan to see the businesses at each point. This scan only stored ranking positions.
    </p>
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-chip border border-hairline bg-card p-0.5">
          <button
            type="button"
            onClick={() => setView("map")}
            aria-pressed={view === "map"}
            className={cn(
              "inline-flex min-h-[36px] items-center gap-1.5 rounded-chip px-3 py-1.5 text-[13px] font-semibold",
              view === "map" ? "bg-ink text-white" : "text-sub",
            )}
          >
            <Icon name="map-pin" size={15} /> Map
          </button>
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
            className={cn(
              "inline-flex min-h-[36px] items-center gap-1.5 rounded-chip px-3 py-1.5 text-[13px] font-semibold",
              view === "grid" ? "bg-ink text-white" : "text-sub",
            )}
          >
            <Icon name="grid" size={15} /> Grid
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            aria-pressed={view === "table"}
            className={cn(
              "inline-flex min-h-[36px] items-center gap-1.5 rounded-chip px-3 py-1.5 text-[13px] font-semibold",
              view === "table" ? "bg-ink text-white" : "text-sub",
            )}
          >
            <Icon name="file" size={15} /> Table
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="data-chip">20+</span>
            <span
              aria-hidden="true"
              className="h-2.5 w-20 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${intensityFill(0.12)}, ${intensityFill(0.5)}, ${intensityFill(1)})`,
              }}
            />
            <span className="data-chip">#1</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-3 rounded-sm bg-danger-tint ring-1 ring-danger/30" /> Not ranking
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-3 rounded-sm border border-dashed border-hairline bg-paper" /> Not checked
          </span>
        </div>
      </div>

      {view === "map" ? (
        <RankGridMap
          scan={scan}
          competitors={insights.competitors}
          businessName={businessName}
          businessPlaceId={businessPlaceId}
          selected={selected}
          onSelect={setSelected}
        />
      ) : view === "grid" ? (
        <div className="overflow-x-auto">
          <div className="rounded-card border border-hairline bg-primary-wash/40 p-3 sm:p-4">
            <div
              className="mx-auto grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${size}, minmax(44px, 1fr))`,
                maxWidth: size * 64,
              }}
            >
              {Array.from({ length: size }).map((_, row) =>
                Array.from({ length: size }).map((_, col) => {
                  const p = cellAt(row, col);
                  const rank = p ? p.rank : null;
                  // "Google didn't answer" is not "you don't rank here" — the
                  // grid must not read a failed lookup as a ranking loss.
                  const unavailable = Boolean(p?.unavailable);
                  const missing = !unavailable && rank === null;
                  const t = rank === null ? 0 : rankIntensity(rank);
                  const active = selected.row === row && selected.col === col;
                  const count = p?.results?.length ?? 0;
                  return (
                    <button
                      type="button"
                      key={`${row}-${col}`}
                      onClick={() => setSelected({ row, col })}
                      aria-pressed={active}
                      className={cn(
                        "grid aspect-square place-items-center rounded-md text-[14px] font-bold tabular-nums transition-shadow",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
                        unavailable
                          ? "border border-dashed border-hairline bg-paper text-faint"
                          : missing
                            ? "border border-danger/30 bg-danger-tint text-danger"
                            : t >= 0.5
                              ? "text-white"
                              : "text-primary-dark",
                        active && "ring-2 ring-ink ring-offset-2 ring-offset-paper",
                      )}
                      style={missing || unavailable ? undefined : { backgroundColor: intensityFill(t) }}
                      aria-label={
                        unavailable
                          ? `Point row ${row + 1}, column ${col + 1}: not checked, Google did not respond`
                          : `Point row ${row + 1}, column ${col + 1}: rank ${cellLabel(rank)}${count > 0 ? `, ${count} businesses found` : ""}`
                      }
                      title={
                        unavailable
                          ? "Not checked — Google did not respond for this point"
                          : count > 0
                            ? `Rank ${cellLabel(rank)} · ${count} businesses found`
                            : `Rank ${cellLabel(rank)}`
                      }
                    >
                      {unavailable ? "–" : cellLabel(rank)}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-faint">
            Each cell is a search point around your clinic. The number is the ranking — one green hue,
            denser = higher. Colour is a second cue, never the only one.
            {hasResults ? " Select a cell to see who ranks there." : ""}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-hairline">
                <th className="kicker py-2 pr-4 font-bold">Grid point</th>
                <th className="kicker py-2 pr-4 font-bold">Rank</th>
                <th className="kicker py-2 pr-4 font-bold">Standing</th>
                <th className="kicker py-2 font-bold">Top result there</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {points.map((p) => {
                const standing =
                  p.rank === null || p.rank > 10 ? "Not visible" : p.rank <= 3 ? "Top 3" : "On page";
                const winner = (p.results ?? [])[0];
                const active = selected.row === p.row && selected.col === p.col;
                return (
                  <tr
                    key={`${p.row}-${p.col}`}
                    onClick={() => setSelected({ row: p.row, col: p.col })}
                    className={cn("cursor-pointer", active && "bg-primary-wash/60")}
                  >
                    <td className="py-2.5 pr-4 text-sub tabular-nums">
                      Row {p.row + 1}, Col {p.col + 1}
                    </td>
                    <td className="py-2.5 pr-4 font-semibold text-ink tabular-nums">{cellLabel(p.rank)}</td>
                    <td className="py-2.5 pr-4 text-sub">{standing}</td>
                    <td className="py-2.5 text-sub">
                      {winner ? (
                        <span className={cn(isOwn(winner) && "font-semibold text-primary-dark")}>
                          {winner.name}
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!hasResults ? (
        backfillHint
      ) : (
        <div className="mt-5 space-y-4">
          {/* ── Who ranks at the selected point ─────────────────── */}
          <section className="rounded-card border border-hairline bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="kicker mb-1">Businesses found here</div>
                <h3 className="text-[16px] font-bold text-ink">
                  Row {selected.row + 1}, Col {selected.col + 1}
                </h3>
                <p className="mt-0.5 text-[12px] text-faint">
                  {selectedOffset ?? `Rank ${cellLabel(selectedPoint?.rank ?? null)} at this point`}
                </p>
              </div>
              <Badge tone={selectedPoint?.rank === null || selectedPoint?.rank === undefined ? "danger" : "primary"}>
                You rank {cellLabel(selectedPoint?.rank ?? null)}
              </Badge>
            </div>

            {selectedResults.length === 0 ? (
              <p className="mt-3 text-[13px] text-sub">
                No businesses were stored for this point. Re-run the scan to capture them.
              </p>
            ) : (
              <ol className="mt-3 space-y-1.5">
                {selectedResults.map((result) => {
                  const own = isOwn(result);
                  const meta = ratingLabel(result);
                  return (
                    <li
                      key={`${result.position}-${result.placeId}`}
                      className={cn(
                        "flex items-start gap-3 rounded-btn border px-3 py-2",
                        own
                          ? "border-primary bg-primary-tint"
                          : "border-hairline bg-paper/60",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-px grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums",
                          own ? "bg-primary text-white" : "bg-hairline/70 text-sub",
                        )}
                      >
                        {result.position}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-[14px] font-semibold",
                            own ? "text-primary-dark" : "text-ink",
                          )}
                        >
                          {result.name}
                          {own ? <span className="ml-1.5 text-[11px] font-bold">· You</span> : null}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-faint">
                          {meta ? (
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Icon name="star-fill" size={12} className="text-gold" />
                              {meta}
                            </span>
                          ) : null}
                          {result.address ? (
                            <span className="truncate">{result.address}</span>
                          ) : null}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* ── The reading: distance reach, direction, and who wins where ── */}
          <RankGridInsightsPanel
            insights={insights}
            keyword={scan.keyword}
            businessName={businessName}
          />
        </div>
      )}
    </div>
  );
}
