import { getData } from "@/lib/data";
import { cn } from "@/lib/utils/cn";
import { Card, CardHeader } from "@/components/ds/Card";
import { EmptyState, Badge } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Paywall } from "@/components/app/Paywall";
import { Icon } from "@/components/icons";
import { StatTile } from "@/components/charts/StatTile";
import { upgradeFor } from "@/lib/billing/plans";
import { subscriptionHasFeature } from "@/lib/billing/trial";
import { formatDate } from "@/lib/utils/format";
import { RankGridView } from "./RankGridView";
import { RankGridRunner } from "./RankGridRunner";

export default async function RankGridPage() {
  const data = await getData();
  // Trial-aware: an expired trial is locked here even though the row still
  // says `trialing` / `growth` (lib/billing/trial.ts).
  const entitled = subscriptionHasFeature(data.subscription, "rank_grid");
  // Named from the entitlement rather than written by hand: the badge used to
  // say "Pro", a tier folded into Growth and now only a legacy alias, while the
  // Paywall directly below it already read "Growth" off this same helper.
  const rankGridPlan = upgradeFor("rank_grid");
  const scan = (data.rankScans ?? [])[0];
  const month = new Date().toISOString().slice(0, 7);
  const scansUsed = data.rankScans.filter((item) => item.ranAt.startsWith(month)).length;
  const scanLimit = ["multi", "agency"].includes(data.subscription.tier) ? 20 : 4;
  const runner = (
    <RankGridRunner
      scansUsed={scansUsed}
      scanLimit={scanLimit}
      connected={Boolean(data.location.googlePlaceId)}
    />
  );

  if (!scan) {
    return (
      <div className="space-y-5">
        <PageHeader
          title={
            <span className="inline-flex items-center gap-2">
              Rank Grid <Badge tone="gold" icon="sparkles">{rankGridPlan.name} and up</Badge>
            </span>
          }
          sub="Measure relevance-ranked Google Places visibility across nearby coordinates."
        />
        {entitled ? (
          runner
        ) : (
          <Paywall feature="rank_grid" title="Run local visibility scans">
            <Card>
              <EmptyState
                icon="grid"
                title="Google Places visibility scanning"
                description={`Scan 9 or 25 nearby coordinates for one search keyword on ${rankGridPlan.name}.`}
              />
            </Card>
          </Paywall>
        )}
        <Card>
          <EmptyState
            icon="grid"
            title="No scan yet"
            description="Run a visibility scan to establish your local search baseline."
          />
        </Card>
      </div>
    );
  }

  const points = scan.points ?? [];
  // A point Google never answered for is not a ranking result. Every figure here
  // is measured-only, for the same reason the scan itself averages that way
  // (lib/actions.ts) — otherwise a Google outage reads as a ranking collapse.
  const measured = points.filter((point) => !point.unavailable);
  const green = measured.filter((point) => point.rank !== null && point.rank <= 3).length;
  const amber = measured.filter(
    (point) => point.rank !== null && point.rank > 3 && point.rank <= 10,
  ).length;
  // Ranking #14 is not "not found" — it is found, and beaten. The two are split
  // so neither is reported as the other.
  const absent = measured.filter((point) => point.rank === null).length;
  const belowTen = measured.filter((point) => point.rank !== null && point.rank > 10).length;
  const red = absent + belowTen;
  const total = measured.length;
  const kpis = [
    { label: "Average rank", value: scan.avgRank.toFixed(1) },
    { label: "Top-3 coverage", value: `${Math.round(scan.shareOfLocalPack * 100)}%` },
    { label: "Top-3 points", value: `${green}/${total}` },
    { label: "Not in top 10", value: red },
  ];

  const overview = (
    <Card raised>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="kicker mb-1.5">Keyword</div>
          <span className="inline-flex items-center gap-1.5 rounded-chip border border-primary bg-primary-tint px-3 py-2 text-[13px] font-semibold text-primary-dark">
            <Icon name="search" size={14} /> {scan.keyword}
          </span>
          <p className="mt-2 data-chip text-faint">
            {scan.gridSize}×{scan.gridSize} grid · {scan.radiusKm ?? 3} km radius · scanned {formatDate(scan.ranAt)}
          </p>
        </div>
        <Badge tone="primary">{amber} rank 4–10</Badge>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-y-6 border-t border-hairline pt-5 sm:grid-cols-4 sm:gap-y-0 sm:divide-x sm:divide-hairline">
        {kpis.map((kpi, index) => (
          <StatTile
            key={kpi.label}
            boxless
            label={kpi.label}
            value={kpi.value}
            className={cn("sm:px-5", index === 0 && "sm:pl-0")}
          />
        ))}
      </div>
    </Card>
  );

  const details = (
    <div className="space-y-5">
      <Card>
        <CardHeader kicker="Coverage" title="Local visibility grid" />
        <RankGridView
          scan={scan}
          businessName={data.location.name}
          {...(data.location.googlePlaceId ? { businessPlaceId: data.location.googlePlaceId } : {})}
        />
      </Card>
      <Card className="border-primary/30 bg-primary-wash/50">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary text-white">
            <Icon name="map-pin" size={20} />
          </div>
          <div>
            <div className="text-[16px] font-bold text-ink">What this means</div>
            <p className="mt-0.5 text-[14px] text-sub">
              You appear in the top three at {green} of {total} search points and below the first 20
              at {red}. Compare future scans to see whether profile work and new reviews improve your
              relevance-ranked Google Places visibility.
            </p>
          </div>
        </div>
      </Card>
      <div className="flex flex-wrap items-center gap-2 px-1">
        <Badge tone="neutral" icon="credit-card">
          Scan cost: {total} checks · {scansUsed} of {scanLimit} monthly scans used
        </Badge>
        <p className="text-[13px] text-faint">
          Source: Google Places Text Search (relevance ranked) · scanned {formatDate(scan.ranAt)}.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            Rank Grid <Badge tone="gold" icon="sparkles">{rankGridPlan.name} and up</Badge>
          </span>
        }
        sub="Measure relevance-ranked Google Places visibility across nearby coordinates."
      />
      {entitled ? runner : null}
      {overview}
      {entitled ? (
        details
      ) : (
        <Paywall feature="rank_grid" title="See your full Rank Grid">
          {details}
        </Paywall>
      )}
    </div>
  );
}
