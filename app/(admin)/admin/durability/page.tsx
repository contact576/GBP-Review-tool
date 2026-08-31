import { getSessionAndData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { StatTile } from "@/components/charts/StatTile";
import {
  MonitoringCallout,
  NotMeasuredPanel,
  NotMeasuredTile,
  TelemetrySourceBadge,
  readPlatformTelemetry,
} from "../../_components/telemetry";
import { DurabilityTable } from "./DurabilityTable";

function filterTone(rate: number): { tone: "primary" | "gold" | "danger"; label: string } {
  if (rate >= 0.2) return { tone: "danger", label: "High filter rate" };
  if (rate >= 0.12) return { tone: "gold", label: "Elevated" };
  return { tone: "primary", label: "Normal" };
}

const KPI_LABELS = ["Posted", "Survived 60d", "Vanished", "Survival rate"] as const;

export default async function AdminDurabilityPage() {
  const { session, data } = await getSessionAndData();
  const telemetry = readPlatformTelemetry(data.platform, session.isDemo);
  const records = [...data.platform.durability].sort((a, b) => b.filteredRate - a.filteredRate);

  const totalPosted = records.reduce((a, r) => a + r.posted, 0);
  const totalSurvived = records.reduce((a, r) => a + r.survived60d, 0);
  const totalVanished = records.reduce((a, r) => a + r.vanished, 0);
  // A survival rate over a zero denominator is undefined, not 100% and not 0%.
  const survivalRate = totalPosted > 0 ? Math.round((totalSurvived / totalPosted) * 100) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Durability watchdog"
        sub={
          telemetry.measured
            ? "Do captured reviews survive? The moat instrument — vanish-detection via re-import diffs."
            : "Vanish-detection does not run in this deployment, so survival cannot be reported — not as a percentage, and not as a clean bill of health."
        }
        actions={<TelemetrySourceBadge telemetry={telemetry} />}
      />

      {telemetry.measured ? null : <MonitoringCallout subject="review durability" />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {telemetry.measured ? (
          <>
            <StatTile label="Posted" value={totalPosted} deltaCaption="Captured across tenants" />
            <StatTile label="Survived 60d" value={totalSurvived} deltaCaption="Still live at 60 days" />
            <StatTile label="Vanished" value={totalVanished} favorableWhenUp={false} deltaCaption="Dropped after posting" />
            {survivalRate === null ? (
              <NotMeasuredTile label="Survival rate" caption="No posted reviews to divide by" />
            ) : (
              <StatTile label="Survival rate" value={`${survivalRate}%`} deltaCaption="Survived ÷ posted" />
            )}
          </>
        ) : (
          KPI_LABELS.map((label) => <NotMeasuredTile key={label} label={label} />)
        )}
      </div>

      {telemetry.measured ? (
        <>
          <Card>
            <CardHeader kicker="Per tenant" title="Review survival" />
            <div className="space-y-4">
              {records.map((r) => {
                const survivedPct = r.posted ? (r.survived60d / r.posted) * 100 : 0;
                const vanishedPct = r.posted ? (r.vanished / r.posted) * 100 : 0;
                const ft = filterTone(r.filteredRate);
                return (
                  <div key={r.id} className="rounded-card border border-hairline p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[14px] font-semibold text-ink">{r.tenant}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] tabular-nums text-sub">Filtered {Math.round(r.filteredRate * 100)}%</span>
                        <Badge tone={ft.tone} icon={ft.tone === "danger" ? "alert" : ft.tone === "gold" ? "flag" : "check-circle"}>
                          {ft.label}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-hairline" aria-hidden>
                      <div className="h-full bg-primary" style={{ width: `${survivedPct}%` }} />
                      <div className="h-full bg-danger" style={{ width: `${vanishedPct}%` }} />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] tabular-nums text-sub">
                      <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-primary" /> {r.survived60d} survived 60d</span>
                      <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-danger" /> {r.vanished} vanished</span>
                      <span className="text-faint">· {r.posted} posted · {r.survived30d} at 30d</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Icon name="trend" size={16} className="text-sub" aria-hidden />
              <span className="kicker text-faint">Raw · durability ledger</span>
            </div>
            <DurabilityTable records={records} />
          </div>
        </>
      ) : (
        <NotMeasuredPanel
          icon="trend"
          title="Vanish-detection not connected"
          description="No re-import diff has run against any tenant, so there is no survival ledger. A 0% or 100% survival rate here would be invented, not observed."
        />
      )}

      <div className="flex items-start gap-2 rounded-card border border-hairline bg-primary-wash p-4 text-[13px] text-sub">
        <Icon name="eye" size={18} className="mt-px shrink-0 text-primary" aria-hidden />
        <p>
          <span className="font-semibold text-ink">How vanish-detection works.</span> Each tenant&apos;s public reviews are
          re-imported on a schedule and diffed against the last snapshot. A review present before but absent now is
          flagged as vanished. A rising <span className="font-semibold text-ink">filtered rate</span> is the earliest
          anomaly: it usually means capture practices are tripping Google&apos;s spam filter. This describes the
          instrument — it is not a claim that the instrument is currently running.
        </p>
      </div>
    </div>
  );
}
