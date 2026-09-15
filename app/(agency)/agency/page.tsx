import Link from "next/link";
import { getAgencyClients, getAgencySessionAndData } from "@/lib/data";
import { emailEnabledFor } from "@/lib/email";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardHeader } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Badge, EmptyState } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { StatTile } from "@/components/charts/StatTile";
import { formatMoney, formatRelative } from "@/lib/utils/format";
import { currencyFor } from "@/lib/utils/region";
import { StatusBadge, statusRank } from "../_components/StatusBadge";
import { OwnListingCard } from "../_components/OwnListingCard";
import { PortfolioActions } from "../_components/PortfolioActions";
import { clientGrowth, clientLinked, isReportOverdue, monthLabel, portfolioReviewsByMonth, summarizePortfolio } from "../_components/portfolio";
import { ACTIVITY_LABEL } from "../_components/activity";

export default async function AgencyOverviewPage() {
  const [{ data, session }, clients] = await Promise.all([getAgencySessionAndData(), getAgencyClients()]);
  const { wholesaleRate, retailAverage, whiteLabel } = data.agency;
  const currency = currencyFor(data.workspace.region);
  const now = new Date();
  const live = !session.isDemo;
  const portfolio = summarizePortfolio(clients, now);
  const reviewsByMonth = portfolioReviewsByMonth(clients);
  const deliveryConnected = session.isDemo || (await emailEnabledFor(data.workspace.id));

  const attention = [...clients]
    .filter((c) => c.status !== "healthy" || !clientLinked(c))
    .sort((a, b) => statusRank[a.status] - statusRank[b.status] || b.needsReply - a.needsReply)
    .slice(0, 6);
  const overdueIds = clients.filter((c) => isReportOverdue(c, now) && c.contactEmail).map((c) => c.locationId);

  const mrr = portfolio.clients * retailAverage;
  const wholesaleCost = portfolio.clients * wholesaleRate;
  const margin = mrr - wholesaleCost;
  const marginPct = mrr ? Math.round((margin / mrr) * 100) : 0;

  const activity = data.auditLog
    .filter((entry) => entry.action.startsWith("agency."))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Overview"
        sub={`Every location ${whiteLabel.brandName} manages, at a glance — what needs a look first, then the numbers.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PortfolioActions enabled={live} linkedCount={portfolio.linked} overdueIds={overdueIds} deliveryConnected={deliveryConnected} />
            <LinkButton href="/agency/clients" icon="plus" size="sm">Add client</LinkButton>
          </div>
        }
      />

      {/* ── Portfolio KPIs — sums of what each client workspace reports ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Clients" value={portfolio.clients} deltaCaption={`${portfolio.linked} with a Google listing`} />
        <StatTile
          label="Google rating"
          value={portfolio.weightedRating === null ? "—" : portfolio.weightedRating.toFixed(1)}
          deltaCaption={portfolio.weightedRating === null ? "No linked listing yet" : `Weighted across ${portfolio.linked} linked`}
        />
        <StatTile label="Reviews held" value={portfolio.totalReviews} deltaCaption="On linked listings" />
        <StatTile label="New reviews · 30d" value={portfolio.newReviews30d} deltaCaption="Detected across clients" />
        <StatTile label="Needs reply" value={portfolio.needsReply} favorableWhenUp={false} deltaCaption="Open across clients" />
        <StatTile
          label="Growth score"
          value={portfolio.avgGrowth === null ? "—" : portfolio.avgGrowth}
          deltaCaption={
            portfolio.avgGrowth === null
              ? "Measured after the first Google sync"
              : `Avg of ${portfolio.measuredGrowth} measured`
          }
        />
      </div>

      {/* Health mix — carried by text + icon, never colour alone */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="kicker text-faint">Health mix</span>
        <Badge tone="primary" icon="check-circle">{portfolio.healthy} healthy</Badge>
        <Badge tone="gold" icon="alert">{portfolio.attention} attention</Badge>
        <Badge tone="danger" icon="flag">{portfolio.atRisk} at risk</Badge>
        <span className="text-faint">·</span>
        <Badge tone={portfolio.reportsOverdue ? "gold" : "primary"} icon="file">
          {portfolio.reportsOverdue ? `${portfolio.reportsOverdue} report${portfolio.reportsOverdue === 1 ? "" : "s"} overdue` : "Reports current"}
        </Badge>
        <Badge tone={portfolio.withLogin === portfolio.clients && portfolio.clients ? "primary" : "sub"} icon="lock">
          {portfolio.withLogin} of {portfolio.clients} clients can sign in
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              kicker="Attention first"
              title="Clients that need a look"
              action={<LinkButton href="/agency/clients" variant="ghost" size="sm" iconRight="chevron-right">Full book</LinkButton>}
            />
            {attention.length ? (
              <ul className="divide-y divide-soft">
                {attention.map((c) => (
                  <li key={c.locationId}>
                    <Link
                      href={`/agency/clients/${c.locationId}`}
                      className="flex items-center gap-3 rounded-btn py-3 transition-colors hover:bg-white/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[14px] font-semibold text-ink">{c.name}</span>
                          <StatusBadge status={c.status} />
                          {!clientLinked(c) ? <Badge tone="gold" icon="alert">No listing</Badge> : null}
                          {isReportOverdue(c, now) ? <Badge tone="sub" icon="file">Report overdue</Badge> : null}
                        </div>
                        <div className="mt-0.5 text-[12px] tabular-nums text-sub">
                          {c.city || "City not set"} · Growth {clientGrowth(c) ?? "not measured"} · {c.needsReply} awaiting reply · {c.newReviews30d} new reviews
                        </div>
                      </div>
                      <Icon name="chevron-right" size={18} className="shrink-0 text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : clients.length ? (
              <EmptyState
                icon="check-circle"
                title="All clients healthy"
                description="Nothing needs a look right now — every location you manage is linked and in good shape."
              />
            ) : (
              <EmptyState
                icon="users"
                title="No clients yet"
                description="Add your first client to start tracking their reviews, profile and growth in one place."
                action={<LinkButton href="/agency/clients" icon="plus" size="sm">Add client</LinkButton>}
              />
            )}
          </Card>

          <Card>
            <CardHeader
              kicker="Portfolio"
              title="Reviews detected across the book"
              action={<span className="text-[12px] text-faint">Last 6 months</span>}
            />
            <PortfolioBars data={reviewsByMonth} />
          </Card>

          <Card>
            <CardHeader
              kicker="Recent activity"
              title="What the agency did"
              action={<LinkButton href="/agency/activity" variant="ghost" size="sm" iconRight="chevron-right">All activity</LinkButton>}
            />
            {activity.length ? (
              <ul className="divide-y divide-soft">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-ink">
                        {ACTIVITY_LABEL[entry.action] ?? entry.action}
                      </div>
                      <div className="truncate text-[12px] text-sub">
                        {entry.actor}
                        {typeof entry.meta?.name === "string" ? ` · ${entry.meta.name}` : ""}
                        {typeof entry.meta?.contactEmail === "string" ? ` · ${entry.meta.contactEmail}` : ""}
                      </div>
                    </div>
                    <span className="shrink-0 text-[12px] tabular-nums text-faint">{formatRelative(entry.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-faint">
                Nothing recorded yet. Adding, inviting, linking, syncing or removing a client is written here.
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <OwnListingCard
            name={data.location.name}
            city={data.location.city}
            rating={data.location.rating}
            reviewCount={data.location.reviewCount}
            linked={Boolean(data.location.googlePlaceId)}
            gbpConnected={data.location.gbpConnected}
            canOpen={session.role === "agency_admin" && !session.isDemo}
          />

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
              <div className="h-px bg-ink/[.07]" />
              <div className="flex items-center justify-between">
                <dt className="text-[13px] font-semibold text-ink">Your margin</dt>
                <dd className="data-chip text-[18px] font-extrabold text-primary">{formatMoney(margin, currency)}</dd>
              </div>
            </dl>
            <div className="mt-4 rounded-btn bg-primary-wash/70 p-3 text-[12px] text-sub">
              <span className="font-semibold text-ink">{marginPct}% margin</span> at {formatMoney(retailAverage, currency)} retail
              over {formatMoney(wholesaleRate, currency)} wholesale, across {portfolio.clients} client{portfolio.clients === 1 ? "" : "s"}.
              These are your saved rates, not invoices.
            </div>
            <div className="mt-3">
              <LinkButton href="/agency/economics" variant="secondary" size="sm" fullWidth iconRight="chevron-right">
                Open calculator
              </LinkButton>
            </div>
          </Card>

          <Card>
            <CardHeader kicker="Setup" title="Coverage" />
            <ul className="space-y-2 text-[13px]">
              <CoverageRow label="Google listing linked" done={portfolio.linked} total={portfolio.clients} />
              <CoverageRow label="Business Profile connected" done={portfolio.connected} total={portfolio.clients} />
              <CoverageRow label="Client can sign in" done={portfolio.withLogin} total={portfolio.clients} />
              <CoverageRow label="Report sent in the last 14 days" done={portfolio.clients - portfolio.reportsOverdue} total={portfolio.clients} />
            </ul>
            <p className="mt-3 flex items-start gap-1.5 text-[12px] text-faint">
              <Icon name="alert" size={13} className="mt-px shrink-0" />
              A client&rsquo;s Growth Score is measured only after its Google listing is linked and synced.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CoverageRow({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <li className="flex items-center gap-3">
      <span className="min-w-0 flex-1 truncate text-sub">{label}</span>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
        <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-12 text-right tabular-nums text-ink">{done}/{total}</span>
    </li>
  );
}

/** Six months of detected reviews across every client — real counts, honest zeros. */
function PortfolioBars({ data }: { data: { month: string; count: number }[] }) {
  if (!data.length) {
    return <p className="text-[13px] text-faint">Review history appears once a client&rsquo;s listing is linked and synced.</p>;
  }
  const max = Math.max(1, ...data.map((bucket) => bucket.count));
  const total = data.reduce((sum, bucket) => sum + bucket.count, 0);
  const summary = data.map((bucket) => `${monthLabel(bucket.month)} ${bucket.count}`).join(", ");
  return (
    <div role="img" aria-label={`Reviews detected per month: ${summary}`}>
      <div className="flex h-[140px] items-end gap-3" aria-hidden="true">
        {data.map((bucket) => (
          <div key={bucket.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[11px] tabular-nums text-sub">{bucket.count}</span>
            <div
              title={`${monthLabel(bucket.month)}: ${bucket.count}`}
              className="w-full max-w-[36px] rounded-t-md bg-primary"
              style={{ height: `${Math.max(bucket.count ? 4 : 1, (bucket.count / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3" aria-hidden="true">
        {data.map((bucket) => (
          <div key={bucket.month} className="flex-1 text-center text-[11px] text-faint">{monthLabel(bucket.month)}</div>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-sub">
        <span className="font-semibold tabular-nums text-ink">{total}</span> reviews detected across the book in six months.
      </p>
    </div>
  );
}
