import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import type { IconName } from "@/components/icons";
import { Icon } from "@/components/icons";
import { Reveal } from "./Reveal";

/**
 * Marketing surface primitives — the glass band system.
 *
 * The public pages sit on the same drifting wallpaper as the app, so the
 * material is identical: frosted glass over brand-tinted light. Rhythm rule
 * (see DESIGN-MAKEOVER §2 "Marketing"): alternate wallpaper / frosted-veil /
 * deep-green bands on a ~112px vertical rhythm. The surface change IS the
 * divider — no rules, no gradients. Never two like bands in a row. The
 * deep-green band is the rationed "voltage" moment; every page closes on one.
 *
 * Tones:
 *   paper  the wallpaper, straight through — the default resting surface
 *   white  a frosted white veil over the wallpaper (`.mk-veil`)
 *   hero   deep-green glass, for the closing CTA
 */

type Tone = "paper" | "white" | "hero";

const toneClass: Record<Tone, string> = {
  paper: "",
  white: "mk-veil",
  hero: "glass-dark on-hero text-white",
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
  // ~112px rhythm on desktop; a touch tighter on small screens.
  return (
    <section id={id} className={cn("relative py-16 sm:py-28", toneClass[tone], className)}>
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

/**
 * The glass card recipe. Every marketing card uses this instead of a solid
 * panel so the wallpaper reads through it. `hover` adds the lift.
 */
export function glassCard(hover = false): string {
  return cn("glass mk-card", hover && "mk-card-lift");
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
    <div
      className={cn(
        "kicker inline-flex items-center gap-2 rounded-full px-3 py-1.5",
        onHero ? "bg-white/10 text-white/80" : "glass text-primary-dark",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", onHero ? "bg-gold" : "bg-primary")} aria-hidden />
      {children}
    </div>
  );
}

/** Section head: kicker pill + display title + optional lede. */
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
    <Reveal className={cn(align === "center" && "mx-auto max-w-2xl text-center", className)}>
      {eyebrow ? <Eyebrow onHero={onHero}>{eyebrow}</Eyebrow> : null}
      <h2
        className={cn(
          "mk-h2 mt-4 text-[30px] sm:text-[42px]",
          onHero ? "text-white" : "text-ink",
        )}
      >
        {title}
      </h2>
      {lede ? (
        <p
          className={cn(
            "mt-5 max-w-2xl text-[17px] leading-relaxed sm:text-[18px]",
            align === "center" && "mx-auto",
            onHero ? "text-white/75" : "text-sub",
          )}
        >
          {lede}
        </p>
      ) : null}
    </Reveal>
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
    <ul className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {TRUST.map((t, i) => (
        <Reveal
          as="li"
          key={t.label}
          delay={i * 70}
          className={cn(
            "flex items-start gap-3 p-4",
            onHero ? "rounded-card bg-white/10" : glassCard(),
          )}
        >
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
        </Reveal>
      ))}
    </ul>
  );
}

/**
 * Deep-green closing CTA — the single voltage moment that ends a page.
 * A rounded slab of dark glass floating on the wallpaper rather than a
 * full-bleed band, so the page closes on an object, not a stripe.
 */
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
    <section className="px-4 py-16 sm:px-6 sm:py-28">
      <Reveal className="mx-auto max-w-5xl">
        <div className="glass-dark on-hero rounded-sheet px-6 py-14 text-center text-white sm:px-12 sm:py-20">
          {eyebrow ? <Eyebrow onHero>{eyebrow}</Eyebrow> : null}
          <h2 className="mk-h2 mx-auto mt-4 max-w-2xl text-[32px] text-white sm:text-[46px]">
            {title}
          </h2>
          {lede ? <p className="mx-auto mt-5 max-w-lg text-[17px] leading-relaxed text-white/75">{lede}</p> : null}
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">{actions}</div>
          {footnote ? <p className="mt-6 text-[13px] text-white/60">{footnote}</p> : null}
        </div>
      </Reveal>
    </section>
  );
}

/** Translucent white secondary button styling for use on the deep-green slab. */
export const heroSecondaryBtn = "border-white/25 bg-white/10 text-white hover:bg-white/20";
