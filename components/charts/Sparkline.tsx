import { cn } from "@/lib/utils/cn";

/** Stroke-only sparkline with a single tinted gradient fill. No axes. */
export function Sparkline({
  data, width = 120, height = 36, color = "#0C7A63", className, fill = true,
}: {
  data: number[]; width?: number; height?: number; color?: string; className?: string; fill?: boolean;
}) {
  if (data.length < 2) return <div style={{ width, height }} className={className} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const gid = `spark-${color.replace("#", "")}-${data.length}`;

  const first = data[0] ?? 0;
  const last = data[data.length - 1] ?? 0;
  const trend = last > first ? "trending up" : last < first ? "trending down" : "flat";
  const ariaLabel = `Trend chart, ${trend}, from ${first} to ${last}`;

  return (
    <svg width={width} height={height} className={cn("overflow-visible", className)} role="img" aria-label={ariaLabel}>
      {fill ? (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} />
        </>
      ) : null}
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
