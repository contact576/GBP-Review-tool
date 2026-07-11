import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";

// ── Kicker (mono label) ─────────────────────────────────────
export function Kicker({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("kicker", className)}>{children}</div>;
}

// ── Data chip (mono numeric) ────────────────────────────────
export function DataChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("data-chip inline-flex items-center rounded-chip bg-primary-wash px-2 py-0.5 text-primary-dark", className)}>
      {children}
    </span>
  );
}

// ── Badge ───────────────────────────────────────────────────
type BadgeTone = "neutral" | "primary" | "gold" | "danger" | "sub";
const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-primary-wash text-sub",
  primary: "bg-primary-tint text-primary-dark",
  gold: "bg-gold-tint text-gold-deep",
  danger: "bg-danger-tint text-danger",
  sub: "bg-hairline/60 text-sub",
};
export function Badge({
  children, tone = "neutral", icon, className,
}: {
  children: React.ReactNode; tone?: BadgeTone; icon?: IconName; className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-[11px] font-semibold", badgeTones[tone], className)}>
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}

// ── Selectable chip ─────────────────────────────────────────
export function Chip({
  children, selected, onClick, icon, className, disabled,
}: {
  children: React.ReactNode; selected?: boolean; onClick?: () => void; icon?: IconName; className?: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-chip border px-3 py-2 text-[13px] font-medium transition-colors min-h-[40px]",
        selected
          ? "border-primary bg-primary-tint text-primary-dark"
          : "border-hairline bg-card text-sub hover:border-primary/40 hover:text-ink",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      {selected ? <Icon name="check" size={14} /> : icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </button>
  );
}

// ── Divider ─────────────────────────────────────────────────
export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-hairline", className)} />;
}

// ── Skeleton ────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-md", className)} />;
}

// ── Empty state ─────────────────────────────────────────────
export function EmptyState({
  icon = "leaf", title, description, action,
}: {
  icon?: IconName; title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="size-14 rounded-card bg-primary-wash grid place-items-center text-primary mb-4">
        <Icon name={icon} size={26} />
      </div>
      <h3 className="text-[16px] font-bold text-ink">{title}</h3>
      {description ? <p className="text-[14px] text-sub mt-1 max-w-xs">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

// ── Progress rail ───────────────────────────────────────────
export function ProgressRail({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-250",
            i < current ? "bg-primary w-6" : i === current ? "bg-primary/50 w-6" : "bg-hairline w-3",
          )}
        />
      ))}
    </div>
  );
}

// ── Delta indicator (label + arrow + value, never colour alone) ──
export function Delta({ value, suffix = "%", className }: { value: number; suffix?: string; className?: string }) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[12px] font-semibold data-chip",
        up ? "text-primary" : "text-danger",
        className,
      )}
    >
      <Icon name={up ? "arrow-up" : "arrow-down"} size={12} />
      {Math.abs(value)}
      {suffix}
    </span>
  );
}
