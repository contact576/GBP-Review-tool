import { getAgencyClients, getAgencySessionAndData } from "@/lib/data";
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

/** Plain-English labels for the agency's own ledger. */
const ACTIVITY_LABEL: Record<string, string> = {
  "agency.client_created": "Client added",
  "agency.client_removed": "Client removed",
  "agency.client_invited": "Client invited to their workspace",
  "agency.client_google_linked": "Google listing linked",
  "agency.client_contact_updated": "Contact email updated",
  "agency.rates_updated": "Economics rates saved",
  "agency.reports_sent": "Branded reports sent",
};

export default async function AgencyRollupPage() {
  const [{ data, session }, clients] = await Promise.all([getAgencySessionAndData(), getAgencyClients()]);
  const { wholesaleRate, retailAverage, whiteLabel } = data.agency;
  const currency = currencyFor(data.workspace.region);

  const count = clients.length;
  const avgGrowth = count ? Math.round(clients.reduce((a, c) => a + c.growthScore, 0) / count) : 0;
  const totalNewReviews = clients.reduce((a, c) => a + c.newReviews30d, 0);
  const totalNeedsReply = clients.reduce((a, c) => a + c.needsReply, 0);

  const healthy = clients.filter((c) => c.status === "healthy").length;
  const attentionCount = clients.filter((c) => c.status === "attention").length;
  const atRisk = clients.filter((c) => c.status === "at_risk").length;

  const attention = [...clients]
    .filter((c) => c.status !== "healthy")
    .sort((a, b) => statusRank[a.status] - statusRank[b.status] || b.needsReply - a.needsReply);

  const mrr = count * retailAverage;
  const wholesaleCost = count * wholesaleRate;
  const margin = mrr - wholesaleCost;
  const marginPct = mrr ? Math.round((margin / mrr) * 100) : 0;

  const activity = data.auditLog
    .filter((entry) => entry.action.startsWith("agency."))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients"
        sub={`Every location ${whiteLabel.brandName} manages, at a glance — attention first, economics on the right.`}
        actions={<LinkButton href="/agency/clients" icon="plus">Add client</LinkButton>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Clients" value={count} deltaCaption="Active locations" />
        <StatTile label="Avg growth score" value={avgGrowth} deltaCaption="Across the book" />
        <StatTile label="New reviews · 30d" value={totalNewReviews} deltaCaption="Detected across clients" />
        <StatTile label="Needs reply" value={totalNeedsReply} deltaCaption="Open across clients" />
      </div>

      {/* Health mix — red/amber/green counts carried by text + icon, never colour alone */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="kicker text-faint">Health mix</span>
        <Badge tone="primary" icon="check-circle">{healthy} healthy</Badge>
        <Badge tone="gold" icon="alert">{attentionCount} attention</Badge>
        <Badge tone="danger" icon="flag">{atRisk} at risk</Badge>
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
              <ul className="divide-y divide-hairline">
                {attention.map((c) => (
                  <li key={c.locationId}>
                    <a
                      href={`/agency/clients/${c.locationId}`}
                      className="flex items-center gap-3 rounded-btn py-3 transition-colors hover:bg-primary-wash/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[14px] font-semibold text-ink">{c.name}</span>
                          <StatusBadge status={c.status} />
                          {c.googleLinked === false ? <Badge tone="gold" icon="alert">No listing</Badge> : null}
                        </div>
                        <div className="mt-0.5 text-[12px] tabular-nums text-sub">
                          {c.city || "City not set"} · Growth {c.growthScore} · {c.needsReply} awaiting reply · {c.newReviews30d} new reviews
                        </div>
                      </div>
                      <Icon name="chevron-right" size={18} className="shrink-0 text-faint" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon="check-circle"
                title="All clients healthy"
                description="Nothing needs a look right now — every location you manage is in good shape."
              />
            )}
          </Card>

          <Card>
            <CardHeader kicker="Recent activity" title="What the agency did" />
            {activity.length ? (
              <ul className="divide-y divide-hairline">
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
                Nothing recorded yet. Adding, inviting, linking or removing a client is written here.
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
    </div>
  );
}
