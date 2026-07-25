import { getSessionAndData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { StatTile } from "@/components/charts/StatTile";
import { formatMoney } from "@/lib/utils/format";
import { TenantStatusBadge } from "../../_components/TenantStatus";
import {
  MonitoringCallout,
  NotMeasuredPanel,
  NotMeasuredTile,
  TelemetrySourceBadge,
  readPlatformTelemetry,
} from "../../_components/telemetry";
import { SubscriptionsTable } from "./SubscriptionsTable";

const KPI_LABELS = ["Total MRR", "ARPA", "Trial conversion", "Active accounts"] as const;

export default async function AdminBillingPage() {
  const { session, data } = await getSessionAndData();
  const telemetry = readPlatformTelemetry(data.platform, session.isDemo);
  const { tenants, kpis } = data.platform;

  const totalMrr = tenants.reduce((a, t) => a + t.mrr, 0);
  const active = tenants.filter((t) => t.status === "active");
  const trialing = tenants.filter((t) => t.status === "trialing");
  const pastDue = tenants.filter((t) => t.status === "past_due");
  // Revenue per account is undefined with no accounts — never render it as $0.
  const arpa = tenants.length > 0 ? Math.round(totalMrr / tenants.length) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing ops"
        sub={
          telemetry.measured
            ? "Subscription health, trial conversion, and dunning across every tenant."
            : "Platform-wide billing roll-ups are not computed in this deployment. No revenue figure is shown, because $0 here would be a claim, not a reading."
        }
        actions={<TelemetrySourceBadge telemetry={telemetry} />}
      />

      {telemetry.measured ? null : <MonitoringCallout subject="platform billing" />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {telemetry.measured ? (
          <>
            <StatTile label="Total MRR" value={formatMoney(totalMrr)} deltaCaption={`${tenants.length} tenants`} />
            {arpa === null ? (
              <NotMeasuredTile label="ARPA" caption="No accounts to average over" />
            ) : (
              <StatTile label="ARPA" value={formatMoney(arpa)} deltaCaption="Avg revenue / account" />
            )}
            <StatTile label="Trial conversion" value={`${Math.round(kpis.trialConversion * 100)}%`} deltaCaption={`${trialing.length} in trial`} />
            <StatTile label="Active accounts" value={active.length} deltaCaption="Paying, current" />
          </>
        ) : (
          KPI_LABELS.map((label) => <NotMeasuredTile key={label} label={label} />)
        )}
      </div>

      {telemetry.measured && pastDue.length > 0 ? (
        <Card className="border-danger/40 bg-danger-tint/40">
          <CardHeader
            kicker="Dunning"
            title="Past-due accounts"
            action={
              <Badge tone="danger" icon="alert">
                <span className="tabular-nums">{pastDue.length}</span>&nbsp;action{pastDue.length === 1 ? "" : "s"} needed
              </Badge>
            }
          />
          <ul className="divide-y divide-hairline">
            {pastDue.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <div className="text-[14px] font-semibold text-ink">{t.name}</div>
                  <div className="text-[12px] capitalize text-sub">{t.plan} · {t.region}</div>
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

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Icon name="credit-card" size={16} className="text-sub" aria-hidden />
          <span className="kicker text-faint">Subscriptions · by tenant</span>
        </div>
        {telemetry.measured ? (
          <SubscriptionsTable tenants={tenants} />
        ) : (
          <NotMeasuredPanel
            icon="credit-card"
            title="Subscription roll-up not measured"
            description="No cross-tenant billing aggregate reaches this console, so no subscription ledger and no dunning list can be shown. Absence of past-due accounts here is not evidence that there are none."
          />
        )}
      </div>
    </div>
  );
}
