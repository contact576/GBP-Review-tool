import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";

/**
 * Docs-style settings primitives (presentational, server-safe):
 *  - Callout: semantic banner family (tip / success / warning / info / danger),
 *    line icons, no emoji.
 *  - SpecList / SpecRow: two-column key/value spec rows.
 *  - SettingsSection: a titled content block (kicker + title + optional action).
 */

// ── Semantic callout banner ─────────────────────────────────
type CalloutTone = "tip" | "success" | "warning" | "info" | "danger";

const calloutStyles: Record<CalloutTone, { wrap: string; icon: string; defaultIcon: IconName }> = {
  tip: { wrap: "border-primary/25 bg-primary-wash/60", icon: "text-primary", defaultIcon: "sparkles" },
  success: { wrap: "border-primary/30 bg-primary-tint/50", icon: "text-primary", defaultIcon: "check-circle" },
  warning: { wrap: "border-gold/40 bg-gold-tint/50", icon: "text-gold-deep", defaultIcon: "alert" },
  info: { wrap: "border-hairline bg-primary-wash/40", icon: "text-sub", defaultIcon: "shield" },
  danger: { wrap: "border-danger/30 bg-danger-tint/60", icon: "text-danger", defaultIcon: "alert" },
};

export function Callout({
  tone = "info",
  title,
  icon,
  children,
  className,
}: {
  tone?: CalloutTone;
  title?: string;
  icon?: IconName;
  children?: React.ReactNode;
  className?: string;
}) {
  const s = calloutStyles[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-card border p-3.5", s.wrap, className)}>
      <Icon name={icon ?? s.defaultIcon} size={18} className={cn("mt-0.5 shrink-0", s.icon)} />
      <div className="min-w-0 text-[13px] leading-relaxed text-sub">
        {title ? <div className="text-[14px] font-semibold text-ink">{title}</div> : null}
        {children ? <div className={title ? "mt-0.5" : undefined}>{children}</div> : null}
      </div>
    </div>
  );
}

// ── Key/value spec rows ─────────────────────────────────────
export function SpecList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("divide-y divide-hairline", className)}>{children}</dl>;
}

export function SpecRow({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="kicker w-44 shrink-0 normal-case">{label}</dt>
      <dd className={cn("min-w-0 flex-1 text-[15px] text-ink", mono && "data-chip text-[13px]")}>
        {children}
      </dd>
    </div>
  );
}

// ── Section heading (docs rhythm) ───────────────────────────
export function SettingsSection({
  title,
  kicker,
  action,
  children,
  className,
}: {
  title: string;
  kicker?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-card border border-hairline bg-card p-4 shadow-sm sm:p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          {kicker ? <div className="kicker mb-1">{kicker}</div> : null}
          <h2 className="text-[18px] font-bold leading-tight text-ink">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
