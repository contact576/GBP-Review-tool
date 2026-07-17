"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { intensityFill } from "@/components/charts/tokens";
import type { RankGridScan } from "@/lib/data/types";

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

export function RankGridView({ scan }: { scan: RankGridScan }) {
  const [view, setView] = useState<"grid" | "table">("grid");
  const size = scan.gridSize;
  const points = scan.points ?? [];

  // Order points into rows/cols for a stable grid.
  const cellAt = (row: number, col: number) =>
    points.find((p) => p.row === row && p.col === col) ?? null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-chip border border-hairline bg-card p-0.5">
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
            className={cn(
              "inline-flex min-h-[36px] items-center gap-1.5 rounded-chip px-3 py-1.5 text-[13px] font-semibold",
              view === "grid" ? "bg-ink text-white" : "text-sub",
            )}
          >
            <Icon name="grid" size={15} /> Map
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
        </div>
      </div>

      {view === "grid" ? (
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
                  const missing = rank === null;
                  const t = missing ? 0 : rankIntensity(rank);
                  return (
                    <div
                      key={`${row}-${col}`}
                      className={cn(
                        "grid aspect-square place-items-center rounded-md text-[14px] font-bold tabular-nums",
                        missing
                          ? "border border-danger/30 bg-danger-tint text-danger"
                          : t >= 0.5
                            ? "text-white"
                            : "text-primary-dark",
                      )}
                      style={missing ? undefined : { backgroundColor: intensityFill(t) }}
                      aria-label={`Point row ${row + 1}, column ${col + 1}: rank ${cellLabel(rank)}`}
                      title={`Rank ${cellLabel(rank)}`}
                    >
                      {cellLabel(rank)}
                    </div>
                  );
                }),
              )}
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-faint">
            Each cell is a search point around your clinic. The number is the ranking — one green hue,
            denser = higher. Colour is a second cue, never the only one.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-hairline">
                <th className="kicker py-2 pr-4 font-bold">Grid point</th>
                <th className="kicker py-2 pr-4 font-bold">Rank</th>
                <th className="kicker py-2 font-bold">Standing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {points.map((p) => {
                const standing =
                  p.rank === null || p.rank > 10 ? "Not visible" : p.rank <= 3 ? "Top 3" : "On page";
                return (
                  <tr key={`${p.row}-${p.col}`}>
                    <td className="py-2.5 pr-4 text-sub tabular-nums">
                      Row {p.row + 1}, Col {p.col + 1}
                    </td>
                    <td className="py-2.5 pr-4 font-semibold text-ink tabular-nums">{cellLabel(p.rank)}</td>
                    <td className="py-2.5 text-sub">{standing}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
