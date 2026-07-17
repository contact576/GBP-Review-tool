# Foundly — DESIGN.md

> Portable design-system spec (the "awesome-design-md" format). Any AI agent
> editing this repo should read this file first and keep every new surface
> consistent with it. Source of truth for tokens = `tailwind.config.ts` +
> `app/globals.css`; this file is the human/agent-readable contract.
>
> Foundly's design lineage (from the product blueprint): **Linear's clarity ×
> Stripe's trust × Duolingo's rationed celebration.** Warm, calm, premium —
> "trust-forward with celebratory energy," never casino theatrics.

## Theme & atmosphere
- **Light-first**, warm-paper canvas (never stark white, never dark mode).
- White cards float on paper with **two-layer soft shadows**; the single
  deep-green **hero card** is the one emotional focal point per screen.
- **One hero number per screen.** Generous whitespace. Quiet charts. Zero jargon
  ("people who found you", never "impressions/CTR").
- **Two-accent discipline:** green = trust/go; gold = earned celebration, rationed.

## Color palette (semantic tokens — never raw hex in components)
| Token | Hex | Role |
|---|---|---|
| `ink` | #17201D | Primary text, hero numbers, headings (a near-black — never `#000`) |
| `sub` | #5C6663 | Secondary text, labels |
| `faint` | #8A938F | Tertiary/meta, placeholders, disabled |
| `paper` | #F7F6F2 | App canvas (warm) |
| `card` | #FFFFFF | Surface fill floating on paper |
| `hairline` | #E7E5DE | Borders, dividers, table rules, input outlines |
| `primary` | #0C7A63 | CTAs, "go", active nav, focus ring, high score band |
| `primary-dark` | #085546 | Button press/hover, text-on-tint |
| `primary-tint` | #E3F0EB | Selected chips, badges |
| `primary-wash` | #F0F6F3 | Section bg, hover rows, chart fills |
| `gold` | #E8A33D | Celebration, spark, streaks, milestones (rationed) |
| `gold-deep` | #C77E1B | Gold text/icons needing contrast |
| `gold-tint` | #FBF1DE | Celebration wash, gold badge bg |
| `danger` | #C4452F | Errors, destructive (muted brick — sparing) |
| `danger-tint` | #FAEAE6 | Error field/background |
| `star` | #E9A13B | Review star iconography ONLY |
| `hero` | #0C4A3E | Deep-green hero card / avatars (dark surface — use `.on-hero`) |

**Rules:** accent is CTA/active/link only — never a body-text color, never a
page background. Status colors (primary/gold/danger) are non-themeable. On the
`hero`/`.on-hero` dark surface, the focus ring switches to gold for contrast.

## Typography
- **Hanken Grotesk** for everything (400/500/600/700/800).
- **Spline Sans Mono** (500/600) for the `.kicker` eyebrow and `.data-chip`
  ONLY — never prose. This split is load-bearing for the "engineered, trustworthy" feel.
- **Tabular numerals on all data** — apply `tabular-nums` (`font-variant-numeric:
  tabular-nums`) to every stat value, score, price, rating, review count, and
  table figure. (Adopted from Stripe: numbers that don't jitter read as
  trustworthy financial infrastructure.)
- **Negative tracking on display** — hero numbers and H1 use `tracking-tight`
  (~-0.02em). (Adopted from Linear/Stripe: tight display tracking is premium.)

| Role | Size / weight |
|---|---|
| Hero number | 40–56 (desktop) / 800 / tracking-tight, `tabular-nums` |
| H1 (`PageHeader`) | 26 / lg:30 / 800 / tracking-tight |
| H2 / card title | 18–20 / 700 |
| H3 | 16–18 / 700 |
| Body | 15–16 / 400–500 |
| Body strong | 14–15 / 600 |
| Small / meta | 12–13 / 400–500 |
| Kicker (mono) | 11–12 / 700 / caps / +0.08em |
| Data chip (mono) | 12 / 500–600 / `tabular-nums` |

## Spacing, radii, elevation
- **Spacing:** 4px base (`space-1..10`); card padding 16 mobile / 20–24 desktop;
  32 between sections. No arbitrary values.
- **Radii:** card 16 · button 12 · input 12 · chip/pill 999.
- **Elevation — two levels only.** `shadow-sm` (resting cards/inputs) and
  `shadow-lg` (hero, popovers, modals, hover lift). Prefer a hairline + subtle
  shadow over hard borders. (Linear discipline: hierarchy via surface + hairline,
  not heavy drop shadows.)

## Layout & grid
- Desktop-first here (owner requested); still responsive to phone.
- Owner content: centered `max-w-[1400px]`, 12-col feel, one hero per screen.
- Breakpoints: 390 (base, bottom-tab nav) · 768 (tablet, rail) · 1024–1440 (desktop).
- Page body never scrolls horizontally; wide tables scroll inside their own
  container. Tap targets ≥44px; CTAs ≥40px.

## Components (all inherit tokens; introduce no color/radius/shadow/font outside them)
- **Button** (`components/ds/Button`): primary/secondary/ghost/danger/gold;
  sizes sm/md/lg (h-9/11/12, 44px min). **One primary CTA per section**
  (restraint from both references). Buttons are 12px-radius, not fully-pill.
- **Card** (`components/ds/Card` + `CardHeader`): 16 radius, `p-4 sm:p-5`, shadow-sm.
- **PageHeader** (`components/app/PageHeader`): the ONLY page-title pattern
  (H1 26/30 + subtitle). Use on every authed surface.
- **EmptyState** (`components/ds/misc`): icon + one sentence + one action —
  never a bare paragraph.
- **Score dials / sub-dials / sparkline / bars** (`components/charts`): quiet,
  rounded caps, single tinted fill, no vertical gridlines, no chartjunk. Every
  chart exposes its value as text (`role="img"` + aria-label). Numbers use
  `tabular-nums`.
- **Badge/Chip/Delta:** meaning is always carried by text/icon, never color alone.

## Motion (functional, rationed — never decorative)
- 150–200ms for state/hover/press; 250–350ms for entrances + the score-dial
  sweep. Ease-out/spring, never linear. The only spark/confetti is a genuine
  milestone (~900ms, gold, non-looping). Everything obeys `prefers-reduced-motion`.

## States (write every screen for all six)
Empty · Loading (skeletons matching final layout; the score scan is a narrated
staged progress) · Success (quiet inline + toast, persists) · Celebration
(rationed, gold, one line) · Warning (gold-family, fix-first, non-blocking) ·
Error (muted danger, cause + recovery, never a dead end).

## Accessibility (WCAG 2.1 AA — binding)
Text contrast ≥4.5:1; non-text ≥3:1; tap targets ≥44px; visible 2px focus ring
(never `outline:none` without replacement); reduced-motion kills sweeps/confetti;
icon-only controls carry `aria-label`; color never the sole signal; dials/meters
expose value-as-text; toasts `aria-live`; drawers/modals focus-trapped; charts
have a "view as table"/text equivalent; forms use programmatic labels +
`aria-describedby`.

## Honesty laws (product-specific, non-negotiable)
1. **Attribution honesty** — show customer *actions* ("found you / contacted you
   / new reviews", "detected / likely matched"), never "X customers gained" or
   invented revenue. Microcopy is system-controlled.
2. **No review gating** — on the 1–3★ path the public Google review link is
   ALWAYS visible and clickable (`data-compliance="public-google-link"`).
3. **Dual consent** — service vs marketing are separate legal flags, captured at
   the point of capture; campaign audiences auto-filter to opted-in.
4. **No emoji in app UI** — use the stroked `Icon` set (`currentColor`, ~1.7px).

## Cross-brand lessons folded in (from awesome-design-md: Linear + Stripe)
- **Stripe:** tabular numerals everywhere numbers appear; ink is deep, not pure
  black; one filled CTA per band; reserve the accent for CTAs/links only.
- **Linear:** tight negative tracking on display; surface + hairline hierarchy
  over heavy shadows; a single, disciplined accent (for us, green — gold stays
  rationed to celebration).
- **Deliberately NOT adopted** (they clash with Foundly's identity): dark-first
  canvas, indigo/lavender accents, gradient-mesh heroes, weight-300 body,
  fully-pill CTAs. Foundly stays warm-paper, green/gold, Hanken, 12px-radius CTAs.
