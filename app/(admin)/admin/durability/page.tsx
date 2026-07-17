import { getData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { StatTile } from "@/components/charts/StatTile";
import { DurabilityTable } from "./DurabilityTable";

function filterTone(rate: number): { tone: "primary" | "gold" | "danger"; label: string } {
  if (rate >= 0.2) return { tone: "danger", label: "High filter rate" };
  if (rate >= 0.12) return { tone: "gold", label: "Elevated" };
  return { tone: "primary", label: "Normal" };
}

export default async function AdminDurabilityPage() {
  const data = await getData();
  const records = [...data.platform.durability].sort((a, b) => b.filteredRate - a.filteredRate);

  const totalPosted = records.reduce((a, r) => a + r.posted, 0);
  const totalSurvived = records.reduce((a, r) => a + r.survived60d, 0);
  const totalVanished = records.reduce((a, r) => a + r.vanished, 0);
  const survivalRate = totalPosted ? Math.round((totalSurvived / totalPosted) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Durability watchdog"
        sub="Do captured reviews survive? The moat instrument — vanish-detection via re-import diffs."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Posted" value={totalPosted} deltaCaption="Captured across tenants" />
        <StatTile label="Survived 60d" value={totalSurvived} deltaCaption="Still live at 60 days" />
        <StatTile label="Vanished" value={totalVanished} favorableWhenUp={false} deltaCaption="Dropped after posting" />
        <StatTile label="Survival rate" value={`${survivalRate}%`} deltaCaption="Survived ÷ posted" />
      </div>

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

      <div className="flex items-start gap-2 rounded-card border border-hairline bg-primary-wash p-4 text-[13px] text-sub">
        <Icon name="eye" size={18} className="mt-px shrink-0 text-primary" />
        <p>
          <span className="font-semibold text-ink">Vanish-detection.</span> We re-import each tenant&apos;s public reviews on a
          schedule and diff against the last snapshot. A review present before but absent now is flagged as vanished — the
          durability signal competitors can&apos;t see. A rising <span className="font-semibold text-ink">filtered rate</span> is
          the earliest anomaly: it usually means capture practices are tripping Google&apos;s spam filter and needs a look.
        </p>
      </div>
    </div>
  );
}
