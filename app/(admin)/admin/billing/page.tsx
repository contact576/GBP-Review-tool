import { getData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardHeader } from "@/components/ds/Card";
import { Icon, type IconName } from "@/components/icons";
import { formatMoney } from "@/lib/utils/format";
import { TenantStatusBadge } from "../../_components/TenantStatus";

function SummaryTile({ icon, label, value, sub }: { icon: IconName; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-card border border-hairline bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-sub">
        <Icon name={icon} size={15} />
        <span className="text-[12px] font-medium">{label}</span>
      </div>
      <div className="mt-1.5 text-[26px] font-extrabold leading-none tabular-nums text-ink">{value}</div>
      {sub ? <div className="mt-1 text-[12px] text-faint">{sub}</div> : null}
    </div>
  );
}

export default async function AdminBillingPage() {
  const data = await getData();
  const { tenants, kpis } = data.platform;

  const totalMrr = tenants.reduce((a, t) => a + t.mrr, 0);
  const active = tenants.filter((t) => t.status === "active");
  const trialing = tenants.filter((t) => t.status === "trialing");
  const pastDue = tenants.filter((t) => t.status === "past_due");
  const arpa = tenants.length ? Math.round(totalMrr / tenants.length) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing ops"
        sub="Subscription health, trial conversion, and dunning across every tenant."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile icon="credit-card" label="Total MRR" value={formatMoney(totalMrr)} sub={`${tenants.length} tenants`} />
        <SummaryTile icon="trend" label="ARPA" value={formatMoney(arpa)} sub="Avg revenue / account" />
        <SummaryTile icon="chart" label="Trial conversion" value={`${Math.round(kpis.trialConversion * 100)}%`} sub={`${trialing.length} in trial`} />
        <SummaryTile icon="check-circle" label="Active accounts" value={String(active.length)} sub="Paying, current" />
      </div>

      {pastDue.length > 0 ? (
        <Card className="border-danger/40 bg-danger-tint/40">
          <CardHeader
            kicker="Dunning"
            title="Past-due accounts"
            action={<span className="inline-flex items-center gap-1 text-[12px] font-semibold text-danger"><Icon name="alert" size={14} /> Action needed</span>}
          />
          <ul className="divide-y divide-hairline">
            {pastDue.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <div className="text-[14px] font-semibold text-ink">{t.name}</div>
                  <div className="text-[12px] text-sub capitalize">{t.plan} · {t.region}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="data-chip text-[14px] font-bold text-danger">{formatMoney(t.mrr)}/mo</span>
                  <TenantStatusBadge status={t.status} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader kicker="By tenant" title="Subscriptions" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline">
                {["Tenant", "Plan", "MRR", "Status"].map((h) => (
                  <th key={h} className={`px-3 py-2.5 kicker text-faint ${h === "MRR" ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-b border-hairline last:border-0">
                  <td className="px-3 py-3 text-[14px] font-semibold text-ink">{t.name}</td>
                  <td className="px-3 py-3 text-[14px] capitalize text-sub">{t.plan}</td>
                  <td className="px-3 py-3 text-right data-chip text-[14px] font-bold text-ink">{formatMoney(t.mrr)}</td>
                  <td className="px-3 py-3"><TenantStatusBadge status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
