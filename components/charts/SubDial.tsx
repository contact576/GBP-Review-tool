import { cn } from "@/lib/utils/cn";

function bandColor(score: number, onHero: boolean): string {
  if (onHero) return "#E8A33D";
  if (score >= 75) return "#0C7A63";
  if (score >= 50) return "#E8A33D";
  return "#C4452F";
}

/** Small companion dial (Reviews / Profile sub-scores). */
export function SubDial({
  value, label, size = 84, onHero = false,
}: {
  value: number; label: string; size?: number; onHero?: boolean;
}) {
  const stroke = size * 0.11;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const arcFraction = 0.75;
  const arcLen = circumference * arcFraction;
  const progress = (value / 100) * arcLen;

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[135deg]">
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={onHero ? "rgba(255,255,255,0.16)" : "#E7E5DE"} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${arcLen} ${circumference}`} />
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={bandColor(value, onHero)} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${progress} ${circumference}`} />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className={cn("font-bold tabular-nums", onHero ? "text-white" : "text-ink")} style={{ fontSize: size * 0.3 }}>{value}</span>
        </div>
      </div>
      <span className={cn("kicker", onHero && "text-white/70")}>{label}</span>
    </div>
  );
}
