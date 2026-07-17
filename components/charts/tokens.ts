/**
 * Foundly chart palette — literal values for hand-rolled SVG.
 *
 * Everywhere OUTSIDE of SVG `fill`/`stroke` attributes, components use the
 * Tailwind semantic tokens (text-ink, bg-primary-wash, …). SVG paint attributes
 * can't consume Tailwind classes, so this file mirrors the DESIGN.md tokens as
 * literals in ONE place — never re-typed ad-hoc inside a component.
 *
 * The data-viz palette is a CONTAINED categorical set: green tints + one
 * neutral, quarantined from brand chrome (no gold/danger except where a token
 * has a discrete, labelled meaning). Single-hue sequential ramps only.
 */
export const CHART = {
  ink: "#17201D",
  sub: "#5C6663",
  faint: "#8A938F",
  hairline: "#E7E5DE",
  paper: "#F7F6F2",
  card: "#FFFFFF",
  primary: "#0C7A63",
  primaryDark: "#085546",
  primaryTint: "#E3F0EB",
  primaryWash: "#F0F6F3",
  gold: "#E8A33D",
  goldDeep: "#C77E1B",
  goldTint: "#FBF1DE",
  danger: "#C4452F",
  hero: "#0C4A3E",
} as const;

/**
 * Categorical ramp for part-of-whole charts (Donut / segmented funnel):
 * green tints deep → light. Use at most ~5 before falling back to neutral.
 */
export const GREEN_RAMP = [
  "#085546", // primary-dark
  "#0C7A63", // primary
  "#3E9885",
  "#77B7A8",
  "#AED4CB",
] as const;

/** Neutral segment / "other" — ink at low opacity, guaranteed harmony on paper. */
export const NEUTRAL_SEG = "rgba(23,32,29,0.16)";

/** On the deep-green hero surface, tints run white-translucent instead. */
export const HERO_RAMP = [
  "#FFFFFF",
  "rgba(255,255,255,0.78)",
  "rgba(255,255,255,0.58)",
  "rgba(255,255,255,0.40)",
  "rgba(255,255,255,0.26)",
] as const;

export const HERO_NEUTRAL = "rgba(255,255,255,0.16)";

/**
 * Pick a segment colour by index. `onHero` swaps to the white-translucent ramp.
 * Wraps if there are more segments than ramp stops (caller should cap at ~5).
 */
export function segmentColor(index: number, onHero = false): string {
  const ramp = onHero ? HERO_RAMP : GREEN_RAMP;
  return ramp[index % ramp.length] ?? (onHero ? HERO_NEUTRAL : NEUTRAL_SEG);
}

/**
 * Single-hue sequential green for heatmap / intensity cells.
 * `t` in [0,1] → primary green at graded opacity over a light pane, so the ramp
 * reads as ONE hue getting denser (never a diverging rainbow).
 */
export function intensityFill(t: number, onHero = false): string {
  const clamped = Math.max(0, Math.min(1, t));
  const alpha = 0.08 + clamped * 0.9;
  return onHero
    ? `rgba(255,255,255,${(0.1 + clamped * 0.85).toFixed(3)})`
    : `rgba(12,122,99,${alpha.toFixed(3)})`;
}
