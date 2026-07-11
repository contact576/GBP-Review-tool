import { getData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";

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
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Durability watchdog</h1>
        <p className="text-[14px] text-sub">Do captured reviews survive? The moat instrument — vanish-detection via re-import diffs.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-card border border-hairline bg-card p-4 shadow-sm">
          <div className="kicker text-faint">Posted</div>
          <div className="mt-1.5 text-[26px] font-extrabold leading-none tabular-nums text-ink">{totalPosted}</div>
        </div>
        <div className="rounded-card border border-hairline bg-card p-4 shadow-sm">
          <div className="kicker text-faint">Survived 60d</div>
          <div className="mt-1.5 text-[26px] font-extrabold leading-none tabular-nums text-primary">{totalSurvived}</div>
        </div>
        <div className="rounded-card border border-hairline bg-card p-4 shadow-sm">
          <div className="kicker text-faint">Vanished</div>
          <div className="mt-1.5 text-[26px] font-extrabold leading-none tabular-nums text-danger">{totalVanished}</div>
        </div>
        <div className="rounded-card border border-hairline bg-card p-4 shadow-sm">
          <div className="kicker text-faint">Survival rate</div>
          <div className="mt-1.5 text-[26px] font-extrabold leading-none tabular-nums text-ink">{survivalRate}%</div>
        </div>
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
                    <span className="text-[12px] text-sub">Filtered {Math.round(r.filteredRate * 100)}%</span>
                    <Badge tone={ft.tone} icon={ft.tone === "danger" ? "alert" : ft.tone === "gold" ? "flag" : "check-circle"}>
                      {ft.label}
                    </Badge>
                  </div>
                </div>

                <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-hairline" aria-hidden>
                  <div className="h-full bg-primary" style={{ width: `${survivedPct}%` }} />
                  <div className="h-full bg-danger" style={{ width: `${vanishedPct}%` }} />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-sub">
                  <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-primary" /> {r.survived60d} survived 60d</span>
                  <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-danger" /> {r.vanished} vanished</span>
                  <span className="text-faint">· {r.posted} posted · {r.survived30d} at 30d</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader kicker="Raw" title="Durability table" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline">
                {["Tenant", "Posted", "Survived 30d", "Survived 60d", "Vanished", "Filtered"].map((h) => (
                  <th key={h} className={`px-3 py-2.5 kicker text-faint ${h !== "Tenant" ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-hairline last:border-0">
                  <td className="px-3 py-3 text-[14px] font-semibold text-ink">{r.tenant}</td>
                  <td className="px-3 py-3 text-right data-chip text-[13px] text-ink">{r.posted}</td>
                  <td className="px-3 py-3 text-right data-chip text-[13px] text-ink">{r.survived30d}</td>
                  <td className="px-3 py-3 text-right data-chip text-[13px] font-bold text-primary">{r.survived60d}</td>
                  <td className="px-3 py-3 text-right data-chip text-[13px] font-bold text-danger">{r.vanished}</td>
                  <td className="px-3 py-3 text-right data-chip text-[13px] text-ink">{Math.round(r.filteredRate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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
