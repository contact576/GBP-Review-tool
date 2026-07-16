import { cn } from "@/lib/utils/cn";

// ── Funnel bar (Ask → posted) ───────────────────────────────
export function FunnelBar({
  stages,
}: {
  stages: { label: string; value: number }[];
}) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  const ariaLabel = `Funnel: ${stages.map((s) => `${s.label} ${s.value}`).join(", ")}`;
  return (
    <div className="space-y-2.5" role="img" aria-label={ariaLabel}>
      {stages.map((s) => (
        <div key={s.label} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-[12px] text-sub">{s.label}</span>
          <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-primary-wash">
            <div
              className="h-full rounded-md bg-primary/85 transition-all duration-350"
              style={{ width: `${(s.value / max) * 100}%` }}
            />
            <span className="absolute inset-y-0 left-2.5 flex items-center data-chip text-white mix-blend-normal">
              {s.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Benchmark delta bar (you vs field) ──────────────────────
export function BenchmarkBar({
  label, you, others, unit = "", max,
}: {
  label: string; you: number; others: { name: string; value: number }[]; unit?: string; max?: number;
}) {
  const cap = max ?? Math.max(you, ...others.map((o) => o.value)) * 1.1;
  const row = (name: string, value: number, isYou: boolean) => (
    <div key={name} className="flex items-center gap-2">
      <span className={cn("w-32 shrink-0 truncate text-[12px]", isYou ? "font-semibold text-ink" : "text-sub")}>
        {isYou ? "You" : name}
      </span>
      <div className="relative h-5 flex-1 overflow-hidden rounded bg-primary-wash">
        <div className={cn("h-full rounded", isYou ? "bg-primary" : "bg-faint/50")} style={{ width: `${(value / cap) * 100}%` }} />
      </div>
      <span className={cn("w-12 text-right data-chip", isYou ? "text-primary-dark" : "text-sub")}>{value}{unit}</span>
    </div>
  );
  const ariaLabel = `${label}. You ${you}${unit}${others.length ? ", " + others.map((o) => `${o.name} ${o.value}${unit}`).join(", ") : ""}`;
  return (
    <div role="img" aria-label={ariaLabel}>
      <div className="kicker mb-2">{label}</div>
      <div className="space-y-1.5">
        {row("You", you, true)}
        {others.map((o) => row(o.name, o.value, false))}
      </div>
    </div>
  );
}

// ── Competitor gap bars (free score) ────────────────────────
export function GapBar({
  label, you, area, format = (n) => String(n), goodWhenHigher = true,
}: {
  label: string; you: number; area: number; format?: (n: number) => string; goodWhenHigher?: boolean;
}) {
  const ahead = goodWhenHigher ? you >= area : you <= area;
  const max = Math.max(you, area) * 1.15 || 1;
  const ariaLabel = `${label}: ${ahead ? "Strength" : "Needs work"}. You ${format(you)}, area average ${format(area)}`;
  return (
    <div role="img" aria-label={ariaLabel}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        <span className={cn("text-[12px] font-semibold", ahead ? "text-primary" : "text-danger")}>
          {ahead ? "Strength" : "Needs work"}
        </span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="relative h-4 flex-1 overflow-hidden rounded bg-primary-wash">
            <div className="h-full rounded bg-primary" style={{ width: `${(you / max) * 100}%` }} />
          </div>
          <span className="w-16 text-right data-chip text-primary-dark">{format(you)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative h-4 flex-1 overflow-hidden rounded bg-primary-wash">
            <div className="h-full rounded bg-faint/40" style={{ width: `${(area / max) * 100}%` }} />
          </div>
          <span className="w-16 text-right data-chip text-sub">{format(area)}</span>
        </div>
      </div>
      <div className="mt-1 flex gap-3 text-[11px] text-faint">
        <span>■ You</span>
        <span>■ Area average</span>
      </div>
    </div>
  );
}
