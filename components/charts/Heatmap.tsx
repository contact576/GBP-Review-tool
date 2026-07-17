"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { CHART, intensityFill } from "./tokens";

/**
 * Single-hue green intensity grid (e.g. activity by day × hour) on a rounded
 * light pane. One hue getting denser — never a diverging rainbow. Cells expose
 * their value as text on hover; a legend shows the low→high scale.
 *
 * `null` cells render as explicit "empty" (unsampled), never a fabricated zero.
 * Presentational; pass a rows × cols matrix in. role="img" summary for a11y.
 */
export function Heatmap({
  data,
  rowLabels = [],
  colLabels = [],
  max,
  cellSize = 26,
  gap = 4,
  title = "Activity heatmap",
  legend = true,
  formatValue = (n) => new Intl.NumberFormat("en").format(n),
  unit = "",
  className,
}: {
  /** rows × cols; use `null` for an unsampled / empty cell. */
  data: (number | null)[][];
  rowLabels?: string[];
  colLabels?: string[];
  /** Domain max for the ramp; defaults to the largest cell value. */
  max?: number;
  cellSize?: number;
  gap?: number;
  title?: string;
  legend?: boolean;
  formatValue?: (n: number) => string;
  unit?: string;
  className?: string;
}) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);

  const flat = data.flat().filter((v): v is number => v !== null);
  const domainMax = max ?? (flat.length ? Math.max(...flat) : 1);
  const domainMin = flat.length ? Math.min(...flat) : 0;

  const active =
    hover && data[hover.r]?.[hover.c] !== undefined ? { ...hover, value: data[hover.r]?.[hover.c] ?? null } : null;

  const ariaLabel =
    `${title}. ` +
    (flat.length
      ? `${flat.length} sampled cells, values from ${formatValue(domainMin)}${unit} to ${formatValue(domainMax)}${unit}.`
      : "No data yet.");

  return (
    <figure className={cn("inline-block", className)} role="img" aria-label={ariaLabel}>
      <div className="rounded-card border border-hairline bg-primary-wash/40 p-3">
        <div className="overflow-x-auto">
          <div className="inline-block">
            {/* Column headers */}
            {colLabels.length > 0 ? (
              <div className="flex" style={{ gap, marginLeft: rowLabels.length ? 44 : 0 }}>
                {colLabels.map((c, ci) => (
                  <div
                    key={ci}
                    className="data-chip text-center text-faint"
                    style={{ width: cellSize, fontSize: 10 }}
                  >
                    {c}
                  </div>
                ))}
              </div>
            ) : null}

            {data.map((row, ri) => (
              <div key={ri} className="flex items-center" style={{ gap, marginTop: gap }}>
                {rowLabels.length > 0 ? (
                  <div className="data-chip pr-2 text-right text-faint" style={{ width: 44, fontSize: 10 }}>
                    {rowLabels[ri] ?? ""}
                  </div>
                ) : null}
                {row.map((v, ci) => {
                  const isEmpty = v === null;
                  const t = isEmpty ? 0 : (v - domainMin) / (domainMax - domainMin || 1);
                  const isHover = hover?.r === ri && hover?.c === ci;
                  return (
                    <div
                      key={ci}
                      onMouseEnter={() => setHover({ r: ri, c: ci })}
                      onMouseLeave={() => setHover(null)}
                      className={cn(
                        "rounded-[5px] transition-shadow",
                        isHover && "ring-2 ring-primary ring-offset-1 ring-offset-paper",
                      )}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: isEmpty ? "rgba(23,32,29,0.05)" : intensityFill(t),
                        border: isEmpty ? `1px dashed ${CHART.hairline}` : "none",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Hover read-out — value as text. */}
        <div className="mt-2 min-h-[18px] text-[12px] text-sub" aria-hidden="true">
          {active ? (
            <span>
              {rowLabels[active.r] ? `${rowLabels[active.r]} · ` : ""}
              {colLabels[active.c] ?? ""}
              {rowLabels[active.r] || colLabels[active.c] ? " — " : ""}
              <span className="tabular-nums font-semibold text-ink">
                {active.value === null ? "no data" : `${formatValue(active.value)}${unit}`}
              </span>
            </span>
          ) : (
            <span className="text-faint">Hover a cell for its value</span>
          )}
        </div>
      </div>

      {legend ? (
        <figcaption className="mt-2 flex items-center gap-2 text-[11px] text-faint">
          <span className="data-chip tabular-nums">{formatValue(domainMin)}{unit}</span>
          <span
            aria-hidden="true"
            className="h-2.5 w-28 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${intensityFill(0.06)}, ${intensityFill(0.5)}, ${intensityFill(1)})`,
            }}
          />
          <span className="data-chip tabular-nums">{formatValue(domainMax)}{unit}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}
