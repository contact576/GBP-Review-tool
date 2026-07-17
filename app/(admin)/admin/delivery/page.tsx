import { getData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { StatTile } from "@/components/charts/StatTile";
import { sevRank } from "../../_components/Severity";
import { DeliveryTable } from "./DeliveryTable";

export default async function AdminDeliveryPage() {
  const data = await getData();
  const incidents = [...data.platform.deliveryIncidents].sort(
    (a, b) => sevRank[a.severity] - sevRank[b.severity] || b.count - a.count,
  );
  const totalAffected = incidents.reduce((a, i) => a + i.count, 0);
  const highSev = incidents.filter((i) => i.severity === "high").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Delivery monitor"
        sub="Bounce and carrier-filtering incidents across email and SMS channels."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Messages affected" value={totalAffected} favorableWhenUp={false} deltaCaption="Queued across incidents" />
        <StatTile label="Active incidents" value={incidents.length} favorableWhenUp={false} deltaCaption="Open right now" />
        <div className="rounded-card border border-hairline bg-card p-4 shadow-sm sm:p-5">
          <div className="kicker normal-case">Severity mix</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {highSev > 0 ? (
              <Badge tone="danger" icon="alert">{highSev} high</Badge>
            ) : (
              <Badge tone="primary" icon="check-circle">None high</Badge>
            )}
            <Badge tone="neutral">{incidents.length} total</Badge>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Icon name="send" size={16} className="text-sub" aria-hidden />
          <span className="kicker text-faint">Incidents · delivery failures</span>
        </div>
        <DeliveryTable incidents={incidents} />
      </div>

      <div className="flex items-start gap-2 rounded-card border border-hairline bg-primary-wash p-4 text-[13px] text-sub">
        <Icon name="shield" size={18} className="mt-px shrink-0 text-primary" />
        <p>
          <span className="font-semibold text-ink">A2P 10DLC pipeline.</span> SMS routes through registered A2P campaigns —
          carrier filtering spikes usually mean a brand/campaign needs re-vetting or throughput is being throttled. Email
          soft-bounces retry on a backoff before suppression. Monitor here; escalate high-severity carrier filtering first.
        </p>
      </div>
    </div>
  );
}
