/**
 * Foundly quiet-premium chart / data-viz kit.
 *
 * All components are presentational (data passed in), token-only, hand-rolled
 * SVG, tabular numerals, no emoji, value-as-text for a11y. See DESIGN.md +
 * DESIGN-MAKEOVER.md §3 (DATA-VIZ PLAN).
 */

// New kit
export { Donut, type DonutSegment } from "./Donut";
export { LineArea, type LinePoint } from "./LineArea";
export { Funnel, type FunnelStage } from "./Funnel";
export { Heatmap } from "./Heatmap";
export { StatTile } from "./StatTile";
export { ProgressMeter } from "./ProgressMeter";

// Existing primitives (unchanged signatures — re-exported for one import site)
export { ScoreDial } from "./ScoreDial";
export { SubDial } from "./SubDial";
export { Sparkline } from "./Sparkline";
export { FunnelBar, BenchmarkBar, GapBar } from "./Bars";

// Shared palette helpers (for advanced callers computing their own segments)
export { CHART, GREEN_RAMP, segmentColor, intensityFill } from "./tokens";
