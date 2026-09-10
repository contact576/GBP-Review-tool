import { CHART } from "@/components/charts/tokens";

type GrowthPoint = { date: string; value: number | null };
type Coord = { date: string; value: number; x: number; y: number };

/**
 * Monotone-cubic path through the points — a smooth line that never
 * overshoots the data (a Catmull-Rom spline would bulge past a peak and
 * imply a score the business never had).
 */
function smoothPath(points: Coord[]): string {
  if (points.length < 2) return points.length ? `M${points[0]!.x} ${points[0]!.y}` : "";
  const n = points.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx[i] = points[i + 1]!.x - points[i]!.x;
    dy[i] = points[i + 1]!.y - points[i]!.y;
    slope[i] = dx[i]! === 0 ? 0 : dy[i]! / dx[i]!;
  }
  const tangent: number[] = [slope[0]!];
  for (let i = 1; i < n - 1; i += 1) {
    const a = slope[i - 1]!;
    const b = slope[i]!;
    tangent[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  tangent[n - 1] = slope[n - 2]!;
  for (let i = 0; i < n - 1; i += 1) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i]! / slope[i]!;
    const b = tangent[i + 1]! / slope[i]!;
    const h = Math.hypot(a, b);
    if (h > 3) {
      const t = 3 / h;
      tangent[i] = t * a * slope[i]!;
      tangent[i + 1] = t * b * slope[i]!;
    }
  }
  let d = `M${points[0]!.x.toFixed(1)} ${points[0]!.y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const third = dx[i]! / 3;
    const c1x = p0.x + third;
    const c1y = p0.y + tangent[i]! * third;
    const c2x = p1.x - third;
    const c2y = p1.y - tangent[i + 1]! * third;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

export function DashboardGrowthChart({ data }: { data: GrowthPoint[] }) {
  const points = data.filter((point): point is { date: string; value: number } => point.value !== null);
  const width = 430;
  const height = 170;
  const pad = { top: 12, right: 12, bottom: 28, left: 30 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const coordinate: Coord[] = points.map((point, index) => ({
    ...point,
    x: pad.left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth),
    y: pad.top + (1 - Math.max(0, Math.min(100, point.value)) / 100) * plotHeight,
  }));
  const line = smoothPath(coordinate);
  const baseline = (pad.top + plotHeight).toFixed(1);
  const area = coordinate.length > 1
    ? `${line} L${coordinate[coordinate.length - 1]!.x.toFixed(1)} ${baseline} L${coordinate[0]!.x.toFixed(1)} ${baseline} Z`
    : "";
  // Up to five evenly spaced date labels, deduplicated so a short series never
  // stacks the same label on top of itself.
  const labelIndexes = coordinate.length
    ? Array.from(new Set(
        (coordinate.length < 5 ? [0, coordinate.length - 1] : [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((coordinate.length - 1) * f))),
      ))
    : [];
  const last = coordinate[coordinate.length - 1];
  const firstValue = coordinate[0]?.value;
  const lastValue = last?.value;
  const summary = coordinate.length
    ? `Local Growth Score moved from ${firstValue} to ${lastValue} across the selected period.`
    : "Local Growth Score trend is not available yet.";

  return (
    <div className="w-full" role="img" aria-label={summary}>
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="dashboard-growth-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.primary} stopOpacity="0.14" />
            <stop offset="70%" stopColor={CHART.primary} stopOpacity="0.03" />
            <stop offset="100%" stopColor={CHART.primary} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="dashboard-growth-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={CHART.primaryDark} />
            <stop offset="100%" stopColor={CHART.primary} />
          </linearGradient>
        </defs>

        {[0, 50, 100].map((tick) => {
          const y = pad.top + (1 - tick / 100) * plotHeight;
          return (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke={CHART.hairline}
                strokeWidth="1"
                strokeDasharray={undefined}
              />
              <text
                x={pad.left - 10}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="11"
                fontWeight="500"
                fill={CHART.faint}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {tick}
              </text>
            </g>
          );
        })}

        {area ? <path d={area} fill="url(#dashboard-growth-area)" /> : null}
        {line && coordinate.length > 1 ? (
          <>
            <path d={line} fill="none" stroke={CHART.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : null}
        {last ? (
          <>
            <circle cx={last.x} cy={last.y} r="4" fill={CHART.card} stroke={CHART.primary} strokeWidth="2" />
          </>
        ) : null}

        {labelIndexes.map((index, labelIndex) => {
          const point = coordinate[index];
          if (!point) return null;
          const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${point.date}T12:00:00`));
          return (
            <text
              key={`${point.date}-${labelIndex}`}
              x={point.x}
              y={height - 8}
              textAnchor={labelIndexes.length === 1 ? "middle" : labelIndex === 0 ? "start" : labelIndex === labelIndexes.length - 1 ? "end" : "middle"}
              fontSize="11"
              fontWeight="500"
              fill={CHART.faint}
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
