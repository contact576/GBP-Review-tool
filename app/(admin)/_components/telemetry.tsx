import { Card } from "@/components/ds/Card";
import { Badge, EmptyState } from "@/components/ds/misc";
import { Icon, type IconName } from "@/components/icons";
import { hasNoPlatformTelemetry } from "@/lib/data/empty";
import type { FoundlyData } from "@/lib/data/types";

/**
 * Honesty layer for the internal ops console.
 *
 * The console must be able to say three different things, and never confuse
 * the last two:
 *   (a) measured, with a value            → render the figure
 *   (b) measured, and genuinely zero      → render 0 / a "Clear" chip
 *   (c) never measured (no telemetry)     → render "Not measured", never a
 *                                           zero and never a green chip
 *
 * Platform-wide aggregates are not computed anywhere in this deployment, so an
 * empty, all-zero `platform` blob means (c). Rendering it as (b) is the whole
 * bug this module exists to prevent: a falsely-green console.
 */

type Platform = FoundlyData["platform"];

export type TelemetrySource = "unavailable" | "demo_fixture" | "stored_snapshot" | "live_aggregate";

export interface PlatformTelemetry {
  /** False → the console has no platform telemetry and must say so. */
  measured: boolean;
  source: TelemetrySource;
}

/** Classify a workspace's platform blob into the three states above. */
export function readPlatformTelemetry(platform: Platform, isDemo: boolean): PlatformTelemetry {
  if (hasNoPlatformTelemetry(platform)) return { measured: false, source: "unavailable" };
  if (platform.measuredAt && !isDemo) return { measured: true, source: "live_aggregate" };
  return { measured: true, source: isDemo ? "demo_fixture" : "stored_snapshot" };
}

/** Per-section coverage. A live snapshot says which sections it computes. */
export function sectionMeasured(
  platform: Platform,
  telemetry: PlatformTelemetry,
  section: Exclude<keyof NonNullable<Platform["coverage"]>, "fraudSignals">,
): boolean {
  if (!telemetry.measured) return false;
  if (!platform.coverage) return true; // fixtures and stored blobs cover everything they carry
  return Boolean(platform.coverage[section]);
}

// ── Canonical wording (one place, so every panel says the same thing) ──
export const NOT_MEASURED = "Not measured";
export const NOT_MEASURED_CAPTION = "Monitoring not connected";
export const NOT_MEASURED_TITLE = "Not measured in this deployment";
export const NOT_MEASURED_BODY =
  "No job computes platform-wide aggregates here, so these figures cannot be produced. They are withheld rather than shown as zero — an unmeasured metric is not a healthy one.";

/** Neutral chip for state (c). Icon + words, never colour alone. */
export function NotMeasuredBadge({ label = NOT_MEASURED }: { label?: string }) {
  return (
    <Badge tone="sub" icon="alert">
      {label}
    </Badge>
  );
}

/** Provenance chip for state (a) — says where the numbers came from. */
export function TelemetrySourceBadge({ telemetry }: { telemetry: PlatformTelemetry }) {
  if (!telemetry.measured) return <NotMeasuredBadge />;
  if (telemetry.source === "demo_fixture") {
    return (
      <Badge tone="gold" icon="eye">
        Demo sample data
      </Badge>
    );
  }
  if (telemetry.source === "live_aggregate") {
    return (
      <Badge tone="primary" icon="refresh">
        Live · computed from the database now
      </Badge>
    );
  }
  return (
    <Badge tone="sub" icon="clock">
      Stored snapshot · not recomputed
    </Badge>
  );
}

/**
 * Page-level explanation of state (c). Neutral surface, dashed edge, warning
 * glyph — deliberately not a green or red status card.
 */
export function MonitoringCallout({ subject }: { subject: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-card border border-dashed border-hairline bg-card p-4">
      <Icon name="alert" size={18} className="mt-px shrink-0 text-faint" aria-hidden />
      <div className="text-[13px] leading-relaxed text-sub">
        <p className="text-[14px] font-semibold text-ink">
          {NOT_MEASURED_CAPTION} — {subject} is not measured in this deployment.
        </p>
        <p className="mt-1">
          {NOT_MEASURED_BODY} Wire a platform-wide aggregation job (and the database it reads) and this console will
          start reporting real numbers.
        </p>
      </div>
    </div>
  );
}

/**
 * KPI cell for state (c). Same rhythm as `StatTile`, but the value slot holds
 * an em dash instead of a number so no figure can be misread as healthy.
 */
export function NotMeasuredTile({
  label,
  caption = NOT_MEASURED_CAPTION,
}: {
  label: string;
  caption?: string;
}) {
  return (
    <div
      role="img"
      aria-label={`${label}: not measured. ${caption}.`}
      className="rounded-card border border-dashed border-hairline bg-card p-4 sm:p-5"
    >
      <div className="kicker normal-case text-faint">{label}</div>
      <div
        className="mt-1.5 text-[32px] font-extrabold leading-none tracking-tight tabular-nums text-faint sm:text-[38px]"
        aria-hidden="true"
      >
        —
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-hidden="true">
        <NotMeasuredBadge />
        <span className="text-[12px] text-faint">{caption}</span>
      </div>
    </div>
  );
}

/** Table/section replacement for state (c) — never a "queue clear" empty state. */
export function NotMeasuredPanel({
  icon = "alert",
  title,
  description,
}: {
  icon?: IconName;
  title: string;
  description: string;
}) {
  return (
    <Card padded={false} className="border-dashed">
      <EmptyState icon={icon} title={title} description={description} action={<NotMeasuredBadge />} />
    </Card>
  );
}

/** Small print used under tables whose controls do not do anything yet. */
export function HonestNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-faint">
      <Icon name="alert" size={13} className="mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
