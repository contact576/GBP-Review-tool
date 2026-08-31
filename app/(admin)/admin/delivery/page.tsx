import { getSessionAndData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { StatTile } from "@/components/charts/StatTile";
import { sevRank } from "../../_components/Severity";
import {
  MonitoringCallout,
  NotMeasuredBadge,
  NotMeasuredPanel,
  NotMeasuredTile,
  TelemetrySourceBadge,
  readPlatformTelemetry,
  NOT_MEASURED_CAPTION,
} from "../../_components/telemetry";
import { DeliveryTable } from "./DeliveryTable";

export default async function AdminDeliveryPage() {
  const { session, data } = await getSessionAndData();
  const telemetry = readPlatformTelemetry(data.platform, session.isDemo);
  const incidents = [...data.platform.deliveryIncidents].sort(
    (a, b) => sevRank[a.severity] - sevRank[b.severity] || b.count - a.count,
  );
  const totalAffected = incidents.reduce((a, i) => a + i.count, 0);
  const highSev = incidents.filter((i) => i.severity === "high").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Delivery monitor"
        sub={
          telemetry.measured
            ? "Bounce and carrier-filtering incidents across email and SMS channels."
            : "Delivery telemetry is not collected in this deployment, so no incident counts are shown — including none that would look clean."
        }
        actions={<TelemetrySourceBadge telemetry={telemetry} />}
      />

      {telemetry.measured ? null : <MonitoringCallout subject="delivery health" />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {telemetry.measured ? (
          <>
            <StatTile label="Messages affected" value={totalAffected} favorableWhenUp={false} deltaCaption="Queued across incidents" />
            <StatTile label="Active incidents" value={incidents.length} favorableWhenUp={false} deltaCaption="Open right now" />
          </>
        ) : (
          <>
            <NotMeasuredTile label="Messages affected" />
            <NotMeasuredTile label="Active incidents" />
          </>
        )}

        <div
          className={
            telemetry.measured
              ? "rounded-card border border-hairline bg-card p-4 shadow-sm sm:p-5"
              : "rounded-card border border-dashed border-hairline bg-card p-4 shadow-sm sm:p-5"
          }
        >
          <div className="kicker normal-case">Severity mix</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {telemetry.measured ? (
              <>
                {highSev > 0 ? (
                  <Badge tone="danger" icon="alert">
                    <span className="tabular-nums">{highSev}</span>&nbsp;high
                  </Badge>
                ) : (
                  <Badge tone="primary" icon="check-circle">None high</Badge>
                )}
                <Badge tone="neutral">
                  <span className="tabular-nums">{incidents.length}</span>&nbsp;total
                </Badge>
              </>
            ) : (
              <>
                <NotMeasuredBadge />
                <span className="text-[12px] text-faint">{NOT_MEASURED_CAPTION}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Icon name="send" size={16} className="text-sub" aria-hidden />
          <span className="kicker text-faint">Incidents · delivery failures</span>
        </div>
        {telemetry.measured ? (
          <DeliveryTable incidents={incidents} />
        ) : (
          <NotMeasuredPanel
            icon="send"
            title="Delivery monitoring not connected"
            description="No bounce or carrier-filtering feed reaches this console. Saying “no active incidents” here would claim email and SMS are delivering cleanly — that is not something we have checked."
          />
        )}
      </div>

      <div className="flex items-start gap-2 rounded-card border border-hairline bg-primary-wash p-4 text-[13px] text-sub">
        <Icon name="shield" size={18} className="mt-px shrink-0 text-primary" aria-hidden />
        <p>
          <span className="font-semibold text-ink">A2P 10DLC pipeline.</span> SMS routes through registered A2P campaigns —
          carrier filtering spikes usually mean a brand/campaign needs re-vetting or throughput is being throttled. Email
          soft-bounces retry on a backoff before suppression. This is how the pipeline behaves; it is background, not a
          statement about current delivery health.
        </p>
      </div>
    </div>
  );
}
