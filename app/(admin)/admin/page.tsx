import Link from "next/link";
import { getData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon, type IconName } from "@/components/icons";
import { StatTile } from "@/components/charts/StatTile";
import { formatMoney, formatNumber } from "@/lib/utils/format";
import { SeverityBadge, sevRank, type Sev } from "../_components/Severity";

function maxSev(list: Sev[], fallback: Sev = "low"): Sev {
  return list.reduce<Sev>((acc, s) => (sevRank[s] < sevRank[acc] ? s : acc), fallback);
}

function AlertCard({
  icon, label, value, sev, detail, href,
}: {
  icon: IconName; label: string; value: string; sev: Sev; detail: string; href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-card border border-hairline bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sub">
          <Icon name={icon} size={16} />
          <span className="text-[12px] font-medium">{label}</span>
        </div>
        <SeverityBadge sev={sev} />
      </div>
      <div className="mt-2 text-[30px] font-extrabold leading-none tabular-nums text-ink">{value}</div>
      <div className="mt-1.5 flex items-center justify-between text-[12px] text-faint">
        <span>{detail}</span>
        <Icon name="chevron-right" size={14} />
      </div>
    </Link>
  );
}

export default async function AdminOverviewPage() {
  const data = await getData();
  const { deliveryIncidents, fraudFlags, tenants, kpis } = data.platform;

  const backlog = deliveryIncidents.reduce((a, i) => a + i.count, 0);
  const deliverySev = maxSev(deliveryIncidents.map((i) => i.severity));
  const fraudSev = maxSev(fraudFlags.map((f) => f.severity));
  const pastDue = tenants.filter((t) => t.status === "past_due");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform health"
        sub="Alerts first, then the numbers. Severity is called out with a label and icon — never color alone."
      />

      <section className="space-y-3">
        <div className="kicker">Needs attention</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AlertCard
            icon="clock" label="Job backlog" value={formatNumber(backlog)} sev={deliverySev}
            detail="messages queued for retry" href="/admin/delivery"
          />
          <AlertCard
            icon="send" label="Delivery spikes" value={String(deliveryIncidents.length)} sev={deliverySev}
            detail="active incidents" href="/admin/delivery"
          />
          <AlertCard
            icon="shield" label="Fraud flags" value={String(fraudFlags.length)} sev={fraudSev}
            detail="in the review queue" href="/admin/fraud"
          />
          <AlertCard
            icon="credit-card" label="Payment issues" value={String(pastDue.length)} sev={pastDue.length > 0 ? "high" : "low"}
            detail={pastDue.length ? `${pastDue.map((t) => t.name.split(" ")[0]).join(", ")} past due` : "all current"} href="/admin/billing"
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="kicker">Platform KPIs</div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Total tenants" value={formatNumber(kpis.totalTenants)} deltaCaption="Orgs on the platform" />
          <StatTile label="Active locations" value={formatNumber(kpis.activeLocations)} deltaCaption="Billable GBP profiles" />
          <StatTile label="Platform MRR" value={formatMoney(kpis.mrr)} deltaCaption="Recurring revenue" />
          <StatTile label="Trial conversion" value={`${Math.round(kpis.trialConversion * 100)}%`} deltaCaption="Trial → paid" />
          <StatTile label="Logo churn" value={`${(kpis.logoChurn * 100).toFixed(1)}%`} deltaCaption="Monthly, by account" />
          <StatTile label="Net revenue retention" value={`${Math.round(kpis.nrr * 100)}%`} deltaCaption="Expansion vs churn" />
          <StatTile label="Detected reviews · wk" value={formatNumber(kpis.weeklyDetectedReviews)} deltaCaption="Across all tenants" />
          <StatTile label="Past-due accounts" value={formatNumber(pastDue.length)} deltaCaption="Need dunning" />
        </div>
      </section>
    </div>
  );
}
