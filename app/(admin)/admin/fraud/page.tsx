import { getSessionAndData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon } from "@/components/icons";
import { sevRank } from "../../_components/Severity";
import {
  MonitoringCallout,
  NotMeasuredPanel,
  TelemetrySourceBadge,
  readPlatformTelemetry,
} from "../../_components/telemetry";
import { FraudQueue } from "./FraudQueue";

export default async function AdminFraudPage() {
  const { session, data } = await getSessionAndData();
  const telemetry = readPlatformTelemetry(data.platform, session.isDemo);
  const flags = [...data.platform.fraudFlags].sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
  const high = flags.filter((f) => f.severity === "high").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fraud queue"
        sub={
          telemetry.measured
            ? "Suspicious review-capture signals awaiting triage. Highest severity first."
            : "Capture-fraud detection is not running in this deployment, so this queue reports nothing rather than reporting clear."
        }
        actions={<TelemetrySourceBadge telemetry={telemetry} />}
      />

      {telemetry.measured ? (
        <>
          <div className="flex items-start gap-2 rounded-card border border-hairline bg-primary-wash p-4 text-[13px] text-sub">
            <Icon name="shield" size={18} className="mt-px shrink-0 text-primary" aria-hidden />
            <p>
              <span className="tabular-nums">{flags.length}</span> open {flags.length === 1 ? "flag" : "flags"}
              {high > 0 ? <> · <span className="tabular-nums">{high}</span> high-severity</> : ""}. Signals include
              repeated device fingerprints, staff devices self-reviewing, and abnormal submission velocity — protecting
              review durability and Google policy compliance.
            </p>
          </div>

          <FraudQueue flags={flags} />
        </>
      ) : (
        <>
          <MonitoringCallout subject="the fraud queue" />
          <NotMeasuredPanel
            icon="shield"
            title="Fraud detection not connected"
            description="No device-fingerprint, staff-self-review, or velocity check runs against this deployment. An empty queue here would claim capture is clean — we have not looked."
          />
        </>
      )}
    </div>
  );
}
