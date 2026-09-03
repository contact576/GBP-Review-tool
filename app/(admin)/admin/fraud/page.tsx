import { getPlatformSnapshot, getSessionAndData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import {
  BURST_MIN_REQUESTS_PER_HOUR,
  VELOCITY_BASELINE_MULTIPLIER,
  VELOCITY_MIN_REVIEWS_24H,
} from "@/lib/platform/fraud";
import { sevRank } from "../../_components/Severity";
import {
  MonitoringCallout,
  NotMeasuredPanel,
  TelemetrySourceBadge,
  readPlatformTelemetry,
  sectionMeasured,
} from "../../_components/telemetry";
import { FraudTriageQueue } from "./FraudTriageQueue";

const SIGNAL_LABEL = {
  velocity_anomaly: "Velocity anomaly",
  staff_self_review: "Staff self-review",
  same_device: "Same device",
} as const;

export default async function AdminFraudPage() {
  const [{ session }, platform] = await Promise.all([getSessionAndData(), getPlatformSnapshot()]);
  const baseTelemetry = readPlatformTelemetry(platform, session.isDemo);
  // Fraud is measured only when the detectors actually ran over tenant data;
  // the snapshot says so per section, and this page must never render an
  // empty queue as "clean" when nothing looked.
  const telemetry = sectionMeasured(platform, baseTelemetry, "fraud")
    ? baseTelemetry
    : { measured: false as const, source: "unavailable" as const };
  const all = [...platform.fraudFlags].sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.at.localeCompare(a.at));
  const open = all.filter((flag) => !flag.triage);
  const triaged = all.filter((flag) => flag.triage);
  const high = open.filter((flag) => flag.severity === "high").length;
  const signals = platform.coverage?.fraudSignals;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fraud queue"
        sub={
          telemetry.measured
            ? "Suspicious review-capture signals awaiting triage. Highest severity first. Dismiss what you have checked; confirm what the tenant must fix."
            : "Capture-fraud detection is not running in this deployment, so this queue reports nothing rather than reporting clear."
        }
        actions={<TelemetrySourceBadge telemetry={telemetry} />}
      />

      {telemetry.measured ? (
        <>
          <div className="flex flex-wrap items-start gap-3 rounded-card border border-hairline bg-primary-wash p-4 text-[13px] text-sub">
            <Icon name="shield" size={18} className="mt-px shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1 space-y-2">
              <p>
                <span className="tabular-nums">{open.length}</span> open {open.length === 1 ? "flag" : "flags"}
                {high > 0 ? <> · <span className="tabular-nums">{high}</span> high-severity</> : ""}
                {triaged.length ? <> · <span className="tabular-nums">{triaged.length}</span> already triaged</> : ""}.
                Detectors run over every real tenant on each load, against the data the platform holds.
              </p>
              {signals ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(Object.keys(SIGNAL_LABEL) as (keyof typeof SIGNAL_LABEL)[]).map((kind) =>
                    signals[kind] ? (
                      <Badge key={kind} tone="primary" icon="check-circle">{SIGNAL_LABEL[kind]} · running</Badge>
                    ) : (
                      <Badge key={kind} tone="sub" icon="lock">{SIGNAL_LABEL[kind]} · not run</Badge>
                    ),
                  )}
                </div>
              ) : null}
              <p className="text-[12px] text-faint">
                Velocity: ≥{VELOCITY_MIN_REVIEWS_24H} captured reviews in 24h at ≥{VELOCITY_BASELINE_MULTIPLIER}× the tenant&rsquo;s own
                30-day rate, or ≥{BURST_MIN_REQUESTS_PER_HOUR} requests inside one hour. Self-review: a customer whose email is a workspace
                login or whose name is a staff member, and was sent a real request. Same-device needs a fingerprint the customer
                flow does not collect, so it does not run — its absence proves nothing.
              </p>
            </div>
          </div>

          <FraudTriageQueue open={open} triaged={triaged} canTriage={!session.isDemo} />
        </>
      ) : (
        <>
          <MonitoringCallout subject="the fraud queue" />
          <NotMeasuredPanel
            icon="shield"
            title="Fraud detection not connected"
            description="No detector ran against this deployment's tenant data. An empty queue here would claim capture is clean — we have not looked."
          />
        </>
      )}
    </div>
  );
}
