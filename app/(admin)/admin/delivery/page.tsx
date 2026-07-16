import { getData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { formatRelative } from "@/lib/utils/format";
import { SeverityBadge, sevRank } from "../../_components/Severity";

export default async function AdminDeliveryPage() {
  const data = await getData();
  const incidents = [...data.platform.deliveryIncidents].sort(
    (a, b) => sevRank[a.severity] - sevRank[b.severity] || b.count - a.count,
  );
  const totalAffected = incidents.reduce((a, i) => a + i.count, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Delivery monitor"
        sub="Bounce and carrier-filtering incidents across email and SMS channels."
      />

      <div className="flex flex-wrap items-center gap-3 rounded-card border border-hairline bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="grid size-10 place-items-center rounded-btn bg-primary-wash text-primary"><Icon name="send" size={20} /></span>
          <div>
            <div className="text-[13px] text-sub">Messages affected</div>
            <div className="text-[22px] font-extrabold leading-none tabular-nums text-ink">{totalAffected}</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge tone="neutral">{incidents.length} active incidents</Badge>
        </div>
      </div>

      <Card>
        <CardHeader kicker="Incidents" title="Delivery failures" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline">
                {["Tenant", "Channel", "Type", "Severity", "Count", "When"].map((h) => (
                  <th key={h} className={`px-3 py-2.5 kicker text-faint ${h === "Count" ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incidents.map((i) => (
                <tr key={i.id} className="border-b border-hairline last:border-0 hover:bg-primary-wash/40">
                  <td className="px-3 py-3 text-[14px] font-semibold text-ink">{i.tenant}</td>
                  <td className="px-3 py-3"><Badge tone="neutral">{i.channel.toUpperCase()}</Badge></td>
                  <td className="px-3 py-3 text-[14px] text-sub">{i.type}</td>
                  <td className="px-3 py-3"><SeverityBadge sev={i.severity} /></td>
                  <td className="px-3 py-3 text-right data-chip text-[14px] font-bold text-ink">{i.count}</td>
                  <td className="px-3 py-3 text-[14px] text-sub">{formatRelative(i.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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
