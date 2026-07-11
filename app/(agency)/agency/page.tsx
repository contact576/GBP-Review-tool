import { getData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Icon, type IconName } from "@/components/icons";
import { formatMoney } from "@/lib/utils/format";
import { currencyFor } from "@/lib/utils/region";
import { StatusBadge, statusRank } from "../_components/StatusBadge";

function MetricTile({ icon, label, value, sub }: { icon: IconName; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-card border border-hairline bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sub">
        <Icon name={icon} size={16} />
        <span className="text-[12px] font-medium">{label}</span>
      </div>
      <div className="mt-2 text-[28px] font-extrabold leading-none tabular-nums text-ink">{value}</div>
      {sub ? <div className="mt-1 text-[12px] text-faint">{sub}</div> : null}
    </div>
  );
}

export default async function AgencyRollupPage() {
  const data = await getData();
  const { clients, wholesaleRate, retailAverage, whiteLabel } = data.agency;
  const currency = currencyFor(data.workspace.region);

  const count = clients.length;
  const avgGrowth = count ? Math.round(clients.reduce((a, c) => a + c.growthScore, 0) / count) : 0;
  const totalNewReviews = clients.reduce((a, c) => a + c.newReviews30d, 0);
  const totalNeedsReply = clients.reduce((a, c) => a + c.needsReply, 0);

  const attention = [...clients]
    .filter((c) => c.status !== "healthy")
    .sort((a, b) => statusRank[a.status] - statusRank[b.status] || b.needsReply - a.needsReply);

  const mrr = count * retailAverage;
  const wholesaleCost = count * wholesaleRate;
  const margin = mrr - wholesaleCost;
  const marginPct = mrr ? Math.round((margin / mrr) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Client rollup</h1>
        <p className="text-[14px] text-sub">
          Every location {whiteLabel.brandName} manages, at a glance — attention first, economics on the right.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile icon="users" label="Clients" value={String(count)} sub="Active locations" />
        <MetricTile icon="chart" label="Avg growth score" value={`${avgGrowth}`} sub="Across the book" />
        <MetricTile icon="star" label="New reviews · 30d" value={String(totalNewReviews)} sub="Detected across clients" />
        <MetricTile icon="chat" label="Needs reply" value={String(totalNeedsReply)} sub="Open across clients" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              kicker="Attention first"
              title="Clients that need a look"
              action={<LinkButton href="/agency/clients" variant="ghost" size="sm" iconRight="chevron-right">Full book</LinkButton>}
            />
            {attention.length ? (
              <ul className="divide-y divide-hairline">
                {attention.map((c) => (
                  <li key={c.locationId}>
                    <a
                      href={`/agency/clients/${c.locationId}`}
                      className="flex items-center gap-3 py-3 transition-colors hover:bg-primary-wash/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[14px] font-semibold text-ink">{c.name}</span>
                          <StatusBadge status={c.status} />
                        </div>
                        <div className="mt-0.5 text-[12px] text-sub">
                          {c.city} · Growth {c.growthScore} · {c.needsReply} awaiting reply · {c.newReviews30d} new reviews
                        </div>
                      </div>
                      <Icon name="chevron-right" size={18} className="shrink-0 text-faint" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-[13px] text-faint">Every client is healthy — nothing needs a look.</p>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader kicker="Book economics" title="Monthly summary" />
          <dl className="space-y-3">
            <div className="flex items-center justify-between">
              <dt className="text-[13px] text-sub">Retail MRR</dt>
              <dd className="data-chip text-[15px] font-bold text-ink">{formatMoney(mrr, currency)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[13px] text-sub">Wholesale cost</dt>
              <dd className="data-chip text-[15px] font-semibold text-sub">−{formatMoney(wholesaleCost, currency)}</dd>
            </div>
            <div className="h-px bg-hairline" />
            <div className="flex items-center justify-between">
              <dt className="text-[13px] font-semibold text-ink">Your margin</dt>
              <dd className="data-chip text-[18px] font-extrabold text-primary">{formatMoney(margin, currency)}</dd>
            </div>
          </dl>
          <div className="mt-4 rounded-btn bg-primary-wash p-3 text-[12px] text-sub">
            <span className="font-semibold text-ink">{marginPct}% margin</span> at {formatMoney(retailAverage, currency)} retail
            over {formatMoney(wholesaleRate, currency)} wholesale, across {count} clients.
          </div>
          <div className="mt-3">
            <LinkButton href="/agency/economics" variant="secondary" size="sm" fullWidth iconRight="chevron-right">
              Open calculator
            </LinkButton>
          </div>
        </Card>
      </div>
    </div>
  );
}
