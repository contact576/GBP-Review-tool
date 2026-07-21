"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { CHART } from "./tokens";

export interface LinePoint {
  label: string;
  /** `null` renders a genuine gap — never a zero-fill (honesty law). */
  value: number | null;
}

/**
 * Line / area trend. Single tinted green area fading to transparent, a
 * rounded-cap line, sparse HORIZONTAL gridlines only (baseline + light rules,
 * never vertical), mono axis labels, and an optional hover point + value.
 *
 * Gaps (`value: null`) are drawn as gaps, not interpolated. Includes an
 * sr-only summary; the SVG itself is decorative.
 */
export function LineArea({
  data,
  width = 560,
  height = 200,
  color = CHART.primary,
  showArea = true,
  yTicks = 3,
  title = "Trend",
  formatValue = (n) => new Intl.NumberFormat("en").format(n),
  formatLabel = (s) => s,
  maxLabels = 6,
  onHero = false,
  className,
}: {
  data: LinePoint[];
  width?: number;
  height?: number;
  color?: string;
  showArea?: boolean;
  yTicks?: number;
  title?: string;
  formatValue?: (n: number) => string;
  formatLabel?: (s: string) => string;
  /** Cap the x-axis tick labels so they never crowd; endpoints always shown. */
  maxLabels?: number;
  onHero?: boolean;
  className?: string;
}) {
  const gid = useId().replace(/[:]/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const pad = { top: 12, right: 14, bottom: 24, left: 40 };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = Math.max(1, height - pad.top - pad.bottom);

  const geo = useMemo(() => {
    const values = data.map((d) => d.value).filter((v): v is number => v !== null);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    // Pad the domain a touch; keep a stable range when flat.
    const span = max - min || Math.abs(max) || 1;
    const lo = min - span * 0.08;
    const hi = max + span * 0.08;
    const range = hi - lo || 1;

    const n = data.length;
    const x = (i: number) => pad.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y = (v: number) => pad.top + (1 - (v - lo) / range) * plotH;

    // Build the line as segments, breaking on nulls so gaps stay gaps.
    const segs: string[] = [];
    let cur = "";
    data.forEach((d, i) => {
      if (d.value === null) {
        if (cur) segs.push(cur);
        cur = "";
        return;
      }
      cur += `${cur ? "L" : "M"}${x(i).toFixed(1)} ${y(d.value).toFixed(1)} `;
    });
    if (cur) segs.push(cur);

    // Area only for contiguous runs (each run closes to the baseline).
    const areas: string[] = [];
    let runStart = -1;
    const baseY = pad.top + plotH;
    const flush = (end: number) => {
      if (runStart < 0) return;
      let d = "";
      for (let i = runStart; i <= end; i++) {
        const v = data[i]?.value;
        if (v === null || v === undefined) continue;
        d += `${d ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      }
      if (d) {
        const xs = x(runStart).toFixed(1);
        const xe = x(end).toFixed(1);
        areas.push(`${d}L${xe} ${baseY.toFixed(1)} L${xs} ${baseY.toFixed(1)} Z`);
      }
      runStart = -1;
    };
    data.forEach((d, i) => {
      if (d.value === null) flush(i - 1);
      else if (runStart < 0) runStart = i;
    });
    flush(data.length - 1);

    const gridY = Array.from({ length: yTicks }, (_, i) => {
      const t = yTicks <= 1 ? 0 : i / (yTicks - 1);
      const val = hi - t * range;
      return { y: pad.top + t * plotH, val };
    });

    const points = data.map((d, i) => ({
      i,
      label: d.label,
      value: d.value,
      cx: x(i),
      cy: d.value === null ? null : y(d.value),
    }));

    return { line: segs, areas, gridY, points, lo, hi };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, width, height, yTicks]);

  const axisColor = onHero ? "rgba(255,255,255,0.55)" : CHART.faint;
  const gridColor = onHero ? "rgba(255,255,255,0.14)" : CHART.hairline;
  const lineColor = onHero ? "#FFFFFF" : color;

  // Sparse, non-crowding x labels: choose one evenly spaced set that already
  // includes both endpoints. Appending the final point to a step-based sample
  // made the last two labels collide on 31-point series.
  const labelCount = Math.min(Math.max(2, maxLabels), data.length);
  const labelIndexes = new Set(
    Array.from({ length: labelCount }, (_, index) =>
      Math.round((index * Math.max(0, data.length - 1)) / Math.max(1, labelCount - 1)),
    ),
  );
  const showLabel = (index: number) => labelIndexes.has(index);

  const active = hover !== null ? geo.points[hover] : undefined;

  const nums = data.map((d) => d.value).filter((v): v is number => v !== null);
  const first = data.find((d) => d.value !== null)?.value ?? null;
  const lastPt = [...data].reverse().find((d) => d.value !== null)?.value ?? null;
  const summary =
    nums.length === 0
      ? `${title}: no data yet.`
      : `${title}: ${nums.length} points from ${formatLabel(data[0]?.label ?? "")} to ${formatLabel(
          data[data.length - 1]?.label ?? "",
        )}. ` +
        (first !== null && lastPt !== null ? `Starts at ${formatValue(first)}, ends at ${formatValue(lastPt)}. ` : "") +
        `Low ${formatValue(Math.min(...nums))}, high ${formatValue(Math.max(...nums))}.`;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    let best = -1;
    let bestD = Infinity;
    geo.points.forEach((p) => {
      if (p.cy === null) return;
      const d = Math.abs(p.cx - px);
      if (d < bestD) {
        bestD = d;
        best = p.i;
      }
    });
    setHover(best >= 0 ? best : null);
  }

  return (
    <div className={cn("w-full", className)} role="img" aria-label={summary}>
      <span className="sr-only">{summary}</span>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="animate-fade-in block h-auto w-full overflow-visible"
        aria-hidden="true"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`la-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={onHero ? 0.28 : 0.18} />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines + mono y labels. No vertical grid. */}
        {geo.gridY.map((g, i) => (
          <g key={i}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={g.y}
              y2={g.y}
              stroke={gridColor}
              strokeWidth={i === geo.gridY.length - 1 ? 1.25 : 1}
            />
            <text
              x={pad.left - 8}
              y={g.y}
              textAnchor="end"
              dominantBaseline="middle"
              fontFamily="var(--font-mono)"
              fontSize={10}
              fill={axisColor}
            >
              {formatValue(Math.round(g.val))}
            </text>
          </g>
        ))}

        {showArea &&
          geo.areas.map((d, i) => <path key={i} d={d} fill={`url(#la-${gid})`} />)}

        {geo.line.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={lineColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Hover marker + value. */}
        {active && active.cy !== null ? (
          <g>
            <circle cx={active.cx} cy={active.cy} r={4.5} fill={onHero ? CHART.hero : CHART.card} stroke={lineColor} strokeWidth={2} />
            <g transform={`translate(${Math.min(Math.max(active.cx, pad.left + 26), width - pad.right - 26)}, ${pad.top + 2})`}>
              <text
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize={11}
                fontWeight={600}
                fill={onHero ? "#FFFFFF" : CHART.ink}
              >
                {active.value !== null ? formatValue(active.value) : ""}
              </text>
            </g>
          </g>
        ) : null}

        {/* Mono x-axis labels. */}
        {geo.points.map((p) =>
          showLabel(p.i) ? (
            <text
              key={p.i}
              x={p.cx}
              y={height - 8}
              textAnchor={p.i === 0 ? "start" : p.i === data.length - 1 ? "end" : "middle"}
              fontFamily="var(--font-mono)"
              fontSize={10}
              fill={axisColor}
            >
              {formatLabel(p.label)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
