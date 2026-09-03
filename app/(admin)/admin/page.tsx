import Link from "next/link";
import { after } from "next/server";
import { getPlatformSnapshot, getProviderFor, getSessionAndData, homeWorkspaceIdFor } from "@/lib/data";
import { recordPlatformHistory } from "@/lib/platform/history-runner";
import { utcDay } from "@/lib/platform/retention";
import { formatDate } from "@/lib/utils/format";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon, type IconName } from "@/components/icons";
import { StatTile } from "@/components/charts/StatTile";
import { formatMoney, formatNumber } from "@/lib/utils/format";
import { SignalBadge, sevRank, type Sev } from "../_components/Severity";
import {
  MonitoringCallout,
  NotMeasuredBadge,
  NotMeasuredTile,
  TelemetrySourceBadge,
  readPlatformTelemetry,
  sectionMeasured,
  NOT_MEASURED_CAPTION,
} from "../_components/telemetry";

function maxSev(list: Sev[], fallback: Sev = "low"): Sev {
  return list.reduce<Sev>((acc, s) => (sevRank[s] < sevRank[acc] ? s : acc), fallback);
}

const KPI_LABELS = [
  "Total tenants",
  "Active locations",
  "Platform MRR",
  "Trial conversion",
  "Logo churn",
  "Net revenue retention",
  "Detected reviews · wk",
  "Past-due accounts",
] as const;

function AlertShell({
  icon,
  label,
  href,
  badge,
  value,
  detail,
  dashed,
}: {
  icon: IconName;
  label: string;
  href: string;
  badge: React.ReactNode;
  value: string;
  detail: string;
  dashed?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        dashed
          ? "block rounded-card border border-dashed border-hairline bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
          : "block rounded-card border border-hairline bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sub">
          <Icon name={icon} size={16} />
          <span className="text-[12px] font-medium">{label}</span>
        </div>
        {badge}
      </div>
      <div
        className={
          dashed
            ? "mt-2 text-[30px] font-extrabold leading-none tabular-nums text-faint"
            : "mt-2 text-[30px] font-extrabold leading-none tabular-nums text-ink"
        }
      >
        {value}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[12px] text-faint">
        <span>{detail}</span>
        <Icon name="chevron-right" size={14} />
      </div>
    </Link>
  );
}

/** Measured alert: a real count plus an earned severity (or "Clear" at zero). */
function AlertCard({
  icon, label, value, count, sev, detail, href,
}: {
  icon: IconName; label: string; value: string; count: number; sev: Sev; detail: string; href: string;
}) {
  return (
    <AlertShell
      icon={icon}
      label={label}
      href={href}
      value={value}
      detail={detail}
      badge={<SignalBadge measured count={count} sev={sev} />}
    />
  );
}

/** State (c): no telemetry behind this alert — no number, no green chip. */
function UnmeasuredAlertCard({ icon, label, href }: { icon: IconName; label: string; href: string }) {
  return (
    <AlertShell
      icon={icon}
      label={label}
      href={href}
      value="—"
      detail={NOT_MEASURED_CAPTION}
      badge={<NotMeasuredBadge />}
      dashed
    />
  );
}

export default async function AdminOverviewPage() {
  const [{ session }, platform] = await Promise.all([getSessionAndData(), getPlatformSnapshot()]);
  const { deliveryIncidents, tenants, kpis } = platform;
  const telemetry = readPlatformTelemetry(platform, session.isDemo);
  const fraudMeasured = sectionMeasured(platform, telemetry, "fraud");
  const retentionMeasured = sectionMeasured(platform, telemetry, "retention");
  // Flags an operator has already dismissed or confirmed are off the queue.
  const fraudFlags = platform.fraudFlags.filter((flag) => !flag.triage);

  const backlog = deliveryIncidents.reduce((a, i) => a + i.count, 0);
  const deliverySev = maxSev(deliveryIncidents.map((i) => i.severity));
  const fraudSev = maxSev(fraudFlags.map((f) => f.severity));
  const pastDue = tenants.filter((t) => t.status === "past_due");

  // History starts the first time an operator looks, not a day later: if
  // today's snapshot is not stored yet, store it after the response goes out.
  // Idempotent per day, so racing the cron is harmless.
  if (telemetry.source === "live_aggregate" && platform.history?.latestAt !== utcDay(new Date())) {
    const provider = await getProviderFor(session);
    const home = homeWorkspaceIdFor(session);
    after(() => recordPlatformHistory({ provider, snapshot: platform, homeWorkspaceId: home, onlyIfMissing: true }).catch(() => undefined));
  }
  const history = platform.history;
  const historyDaysLeft = history ? Math.max(0, history.requiredDays - history.days) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform health"
        sub={
          telemetry.measured
            ? "Alerts first, then the numbers. Severity is called out with a label and icon — never color alone."
            : "This console only reports what it can actually measure. Where platform telemetry is missing it says so instead of showing a zero."
        }
        actions={<TelemetrySourceBadge telemetry={telemetry} />}
      />

      {telemetry.measured ? null : <MonitoringCallout subject="platform health" />}

      <section className="space-y-3">
        <div className="kicker">Needs attention</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {telemetry.measured ? (
            <>
              <AlertCard
                icon="clock" label="Job backlog" value={formatNumber(backlog)} count={backlog} sev={deliverySev}
                detail={backlog === 0 ? "nothing queued for retry" : "messages queued for retry"} href="/admin/delivery"
              />
              <AlertCard
                icon="send" label="Delivery spikes" value={formatNumber(deliveryIncidents.length)}
                count={deliveryIncidents.length} sev={deliverySev}
                detail={deliveryIncidents.length === 0 ? "no active incidents" : "active incidents"} href="/admin/delivery"
              />
              {fraudMeasured ? (
                <AlertCard
                  icon="shield" label="Fraud flags" value={formatNumber(fraudFlags.length)}
                  count={fraudFlags.length} sev={fraudSev}
                  detail={fraudFlags.length === 0 ? "nothing awaiting triage" : "in the review queue"} href="/admin/fraud"
                />
              ) : (
                <UnmeasuredAlertCard icon="shield" label="Fraud flags" href="/admin/fraud" />
              )}
              <AlertCard
                icon="credit-card" label="Payment issues" value={formatNumber(pastDue.length)}
                count={pastDue.length} sev="high"
                detail={pastDue.length ? `${pastDue.map((t) => t.name.split(" ")[0]).join(", ")} past due` : "no past-due accounts"}
                href="/admin/billing"
              />
            </>
          ) : (
            <>
              <UnmeasuredAlertCard icon="clock" label="Job backlog" href="/admin/delivery" />
              <UnmeasuredAlertCard icon="send" label="Delivery spikes" href="/admin/delivery" />
              <UnmeasuredAlertCard icon="shield" label="Fraud flags" href="/admin/fraud" />
              <UnmeasuredAlertCard icon="credit-card" label="Payment issues" href="/admin/billing" />
            </>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="kicker">Platform KPIs</div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {telemetry.measured ? (
            <>
              <StatTile label="Total tenants" value={formatNumber(kpis.totalTenants)} deltaCaption="Orgs on the platform" />
              <StatTile label="Active locations" value={formatNumber(kpis.activeLocations)} deltaCaption="Billable GBP profiles" />
              <StatTile label="Platform MRR" value={formatMoney(kpis.mrr)} deltaCaption="Recurring revenue" />
              <StatTile label="Trial conversion" value={`${Math.round(kpis.trialConversion * 100)}%`} deltaCaption={retentionMeasured ? "Trial → paid" : "Paying ÷ (paying + in trial), today"} />
              {retentionMeasured && platform.retention ? (
                platform.retention.priorPaying === 0 ? (
                  <>
                    <NotMeasuredTile label="Logo churn" caption={`No paying tenants on ${formatDate(platform.retention.priorAt)}`} />
                    <NotMeasuredTile label="Net revenue retention" caption={`No paying tenants on ${formatDate(platform.retention.priorAt)}`} />
                  </>
                ) : (
                  <>
                    <StatTile
                      label="Logo churn"
                      value={`${(kpis.logoChurn * 100).toFixed(1)}%`}
                      favorableWhenUp={false}
                      deltaCaption={`${platform.retention.churned} of ${platform.retention.priorPaying} paying on ${formatDate(platform.retention.priorAt)} lapsed`}
                    />
                    <StatTile
                      label="Net revenue retention"
                      value={`${Math.round(kpis.nrr * 100)}%`}
                      deltaCaption={`${formatMoney(platform.retention.retainedMrr)} today from a ${formatMoney(platform.retention.priorMrr)} cohort`}
                    />
                  </>
                )
              ) : (
                <>
                  <NotMeasuredTile
                    label="Logo churn"
                    caption={
                      history
                        ? historyDaysLeft
                          ? `${history.days} of ${history.requiredDays} days of history · measurable in ${historyDaysLeft} day${historyDaysLeft === 1 ? "" : "s"}`
                          : "Needs a snapshot at least a month old"
                        : "Needs month-over-month history"
                    }
                  />
                  <NotMeasuredTile
                    label="Net revenue retention"
                    caption={
                      history
                        ? history.days
                          ? `Daily snapshots since ${history.firstAt ? formatDate(history.firstAt) : "today"}`
                          : "First daily snapshot is being recorded now"
                        : "Needs month-over-month history"
                    }
                  />
                </>
              )}
              <StatTile label="Detected reviews · wk" value={formatNumber(kpis.weeklyDetectedReviews)} deltaCaption="Across all tenants" />
              <StatTile label="Past-due accounts" value={formatNumber(pastDue.length)} deltaCaption="Need dunning" />
            </>
          ) : (
            KPI_LABELS.map((label) => <NotMeasuredTile key={label} label={label} />)
          )}
        </div>
      </section>
    </div>
  );
}
