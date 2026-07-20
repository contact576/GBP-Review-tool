type GrowthPoint = { date: string; value: number | null };

export function DashboardGrowthChart({ data }: { data: GrowthPoint[] }) {
  const points = data.filter((point): point is { date: string; value: number } => point.value !== null);
  const width = 430;
  const height = 178;
  const pad = { top: 10, right: 14, bottom: 28, left: 28 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const coordinate = points.map((point, index) => ({
    ...point,
    x: pad.left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth),
    y: pad.top + (1 - Math.max(0, Math.min(100, point.value)) / 100) * plotHeight,
  }));
  const line = coordinate.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const area = coordinate.length
    ? `${line} L${coordinate[coordinate.length - 1]!.x.toFixed(1)} ${(pad.top + plotHeight).toFixed(1)} L${coordinate[0]!.x.toFixed(1)} ${(pad.top + plotHeight).toFixed(1)} Z`
    : "";
  const labelIndexes = coordinate.length
    ? [0, Math.round((coordinate.length - 1) * 0.25), Math.round((coordinate.length - 1) * 0.5), Math.round((coordinate.length - 1) * 0.75), coordinate.length - 1]
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
            <stop offset="0%" stopColor="#0C7A63" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#0C7A63" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((tick) => {
          const y = pad.top + (1 - tick / 100) * plotHeight;
          return (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#E7E5DE" strokeWidth="1" />
              <text x={pad.left - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#8A938F">
                {tick}
              </text>
            </g>
          );
        })}

        {area ? <path d={area} fill="url(#dashboard-growth-area)" /> : null}
        {line ? <path d={line} fill="none" stroke="#0C7A63" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {last ? (
          <>
            <circle cx={last.x} cy={last.y} r="5" fill="#FFFFFF" stroke="#0C7A63" strokeWidth="2" />
            <circle cx={last.x} cy={last.y} r="2" fill="#E8A33D" />
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
              y={height - 7}
              textAnchor={labelIndex === 0 ? "start" : labelIndex === labelIndexes.length - 1 ? "end" : "middle"}
              fontSize="9"
              fill="#8A938F"
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
