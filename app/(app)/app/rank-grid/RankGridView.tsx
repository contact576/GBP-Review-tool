"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import type { RankGridScan } from "@/lib/data/types";

function cellStyle(rank: number | null): string {
  if (rank === null || rank > 10) return "bg-danger-tint text-danger border-danger/30";
  if (rank <= 3) return "bg-primary-tint text-primary-dark border-primary/30";
  return "bg-gold-tint text-gold-deep border-gold/30";
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
      <div className="mb-3 flex items-center justify-between">
        <div className="inline-flex rounded-chip border border-hairline bg-card p-0.5">
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-[13px] font-semibold min-h-[36px]",
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
              "inline-flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-[13px] font-semibold min-h-[36px]",
              view === "table" ? "bg-ink text-white" : "text-sub",
            )}
          >
            <Icon name="file" size={15} /> Table
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-faint">
          <span className="inline-flex items-center gap-1">
            <span className="size-3 rounded-sm bg-primary-tint ring-1 ring-primary/30" /> Top 3
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-3 rounded-sm bg-gold-tint ring-1 ring-gold/30" /> 4–10
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-3 rounded-sm bg-danger-tint ring-1 ring-danger/30" /> 11+ / not found
          </span>
        </div>
      </div>

      {view === "grid" ? (
        <div className="overflow-x-auto">
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
                return (
                  <div
                    key={`${row}-${col}`}
                    className={cn(
                      "grid aspect-square place-items-center rounded-md border text-[14px] font-bold tabular-nums",
                      cellStyle(rank),
                    )}
                    aria-label={`Point row ${row + 1}, column ${col + 1}: rank ${cellLabel(rank)}`}
                    title={`Rank ${cellLabel(rank)}`}
                  >
                    {cellLabel(rank)}
                  </div>
                );
              }),
            )}
          </div>
          <p className="mt-3 text-center text-[11px] text-faint">
            Each cell is a search point around your clinic. The number is the ranking — colour is a second cue, never the only one.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-hairline text-faint">
                <th className="py-2 pr-4 font-medium">Grid point</th>
                <th className="py-2 pr-4 font-medium">Rank</th>
                <th className="py-2 font-medium">Standing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {points.map((p) => {
                const standing =
                  p.rank === null || p.rank > 10 ? "Not visible" : p.rank <= 3 ? "Top 3" : "On page";
                return (
                  <tr key={`${p.row}-${p.col}`}>
                    <td className="py-2.5 pr-4 text-sub">
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
