import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import type { IconName } from "@/components/icons";
import { Icon } from "@/components/icons";

/**
 * Marketing surface primitives — the editorial band system.
 *
 * Rhythm rule (see DESIGN-MAKEOVER §2 "Marketing"): alternate warm-paper /
 * white / deep-green bands on a ~96px vertical rhythm. The surface change IS
 * the divider — no rules, no gradients. Never two like bands in a row. The
 * deep-green band is the rationed "voltage" moment; every page closes on a
 * deep-green CTA band.
 */

type Tone = "paper" | "white" | "hero";

const toneClass: Record<Tone, string> = {
  paper: "bg-paper",
  white: "bg-card",
  hero: "bg-hero on-hero text-white",
};

export function Band({
  tone = "paper",
  className,
  children,
  id,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  // ~96px rhythm (py-24 = 96px); a touch tighter on small screens.
  return (
    <section id={id} className={cn(toneClass[tone], "py-16 sm:py-24", className)}>
      {children}
    </section>
  );
}

const widths = {
  sm: "max-w-3xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
} as const;

export function Container({
  size = "lg",
  className,
  children,
}: {
  size?: keyof typeof widths;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("mx-auto px-4 sm:px-6", widths[size], className)}>{children}</div>;
}

/** Mono kicker eyebrow with a small accent dot. Green on light, gold on hero. */
export function Eyebrow({
  children,
  onHero = false,
  className,
}: {
  children: ReactNode;
  onHero?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("kicker inline-flex items-center gap-2", onHero ? "text-white/70" : "text-faint", className)}>
      <span className={cn("size-1.5 rounded-full", onHero ? "bg-gold" : "bg-primary")} aria-hidden />
      {children}
    </div>
  );
}

/** Section head: mono eyebrow + restrained sentence-case display + optional lede. */
export function SectionHead({
  eyebrow,
  title,
  lede,
  onHero = false,
  align = "left",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  onHero?: boolean;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn(align === "center" && "mx-auto max-w-2xl text-center", className)}>
      {eyebrow ? <Eyebrow onHero={onHero}>{eyebrow}</Eyebrow> : null}
      <h2
        className={cn(
          "mt-3 text-[27px] font-bold leading-[1.12] tracking-tight sm:text-[34px]",
          onHero ? "text-white" : "text-ink",
        )}
      >
        {title}
      </h2>
      {lede ? (
        <p className={cn("mt-4 text-[16px] leading-relaxed", onHero ? "text-white/75" : "text-sub")}>{lede}</p>
      ) : null}
    </div>
  );
}

// ── Trust row (4-up, line icons, honesty-law claims — no emoji) ──────────────
const TRUST: { icon: IconName; label: string; caption: string }[] = [
  { icon: "shield", label: "Verified reviews", caption: "Real customers only — never incentivized." },
  { icon: "check-circle", label: "Dual consent", caption: "Service and marketing captured separately." },
  { icon: "eye", label: "No fabricated metrics", caption: "We show real actions, never invented counts." },
  { icon: "google", label: "Google-linked", caption: "Straight to your Business Profile." },
];

export function TrustRow({ onHero = false, className }: { onHero?: boolean; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {TRUST.map((t) => (
        <li key={t.label} className="flex items-start gap-3">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-btn",
              onHero ? "bg-white/10 text-white" : "bg-primary-wash text-primary",
            )}
          >
            <Icon name={t.icon} size={18} />
          </span>
          <div>
            <div className={cn("text-[14px] font-bold leading-tight", onHero ? "text-white" : "text-ink")}>
              {t.label}
            </div>
            <div className={cn("mt-0.5 text-[12px] leading-snug", onHero ? "text-white/60" : "text-sub")}>
              {t.caption}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Deep-green closing CTA band — the single voltage moment that ends a page. */
export function CtaBand({
  eyebrow,
  title,
  lede,
  actions,
  footnote,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <Band tone="hero">
      <Container size="md" className="text-center">
        {eyebrow ? <Eyebrow onHero>{eyebrow}</Eyebrow> : null}
        <h2 className="mx-auto mt-3 max-w-2xl text-[30px] font-bold leading-tight tracking-tight text-white sm:text-[40px]">
          {title}
        </h2>
        {lede ? <p className="mx-auto mt-4 max-w-lg text-[16px] text-white/75">{lede}</p> : null}
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">{actions}</div>
        {footnote ? <p className="mt-5 text-[13px] text-white/60">{footnote}</p> : null}
      </Container>
    </Band>
  );
}

/** Translucent white secondary button styling for use on the deep-green band. */
export const heroSecondaryBtn = "border-white/25 bg-white/10 text-white hover:bg-white/20";
