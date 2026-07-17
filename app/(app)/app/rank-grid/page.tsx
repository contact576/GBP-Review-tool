import { getData } from "@/lib/data";
import { cn } from "@/lib/utils/cn";
import { Card, CardHeader } from "@/components/ds/Card";
import { EmptyState, Badge } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Paywall } from "@/components/app/Paywall";
import { Icon } from "@/components/icons";
import { StatTile } from "@/components/charts/StatTile";
import { hasFeature } from "@/lib/billing/plans";
import { formatDate } from "@/lib/utils/format";
import { RankGridView } from "./RankGridView";

export default async function RankGridPage() {
  const data = await getData();
  const entitled = hasFeature(
    data.subscription.tier,
    "rank_grid",
    data.subscription.status === "trialing",
  );
  const scan = (data.rankScans ?? [])[0];

  if (!scan) {
    return (
      <div className="space-y-5">
        <PageHeader title="Rank Grid" sub="Where you rank on the map, point by point." />
        <Card>
          <EmptyState icon="grid" title="No scan yet" description="Run a rank-grid scan to see your local map coverage." />
        </Card>
      </div>
    );
  }

  const points = scan.points ?? [];
  const green = points.filter((p) => p.rank !== null && p.rank <= 3).length;
  const amber = points.filter((p) => p.rank !== null && p.rank > 3 && p.rank <= 10).length;
  const red = points.filter((p) => p.rank === null || p.rank > 10).length;
  const total = points.length;

  const kpis = [
    { label: "Average rank", value: scan.avgRank.toFixed(1) },
    { label: "Share of local pack", value: `${Math.round(scan.shareOfLocalPack * 100)}%` },
    { label: "Top-3 points", value: `${green}/${total}` },
    { label: "Not found", value: red },
  ];

  // Free teaser — the keyword + coverage headline stays visible on every plan.
  const overview = (
    <Card raised>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="kicker mb-1.5">Keyword</div>
          <span className="inline-flex items-center gap-1.5 rounded-chip border border-primary bg-primary-tint px-3 py-2 text-[13px] font-semibold text-primary-dark">
            <Icon name="search" size={14} /> {scan.keyword}
          </span>
          <p className="mt-2 data-chip text-faint">
            {scan.gridSize}×{scan.gridSize} grid · scanned {formatDate(scan.ranAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="primary">{amber} on page</Badge>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-y-6 border-t border-hairline pt-5 sm:grid-cols-4 sm:gap-y-0 sm:divide-x sm:divide-hairline">
        {kpis.map((k, i) => (
          <StatTile
            key={k.label}
            boxless
            label={k.label}
            value={k.value}
            className={cn("sm:px-5", i === 0 && "sm:pl-0")}
          />
        ))}
      </div>
    </Card>
  );

  // The valuable detail — coverage grid, takeaway, and scan meta. Pro-gated.
  const details = (
    <div className="space-y-5">
      {/* Geo-grid */}
      <Card>
        <CardHeader kicker="Coverage" title="Local map coverage" />
        <RankGridView scan={scan} />
      </Card>

      {/* Takeaway */}
      <Card className="border-primary/30 bg-primary-wash/50">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary text-white">
            <Icon name="map-pin" size={20} />
          </div>
          <div>
            <div className="text-[16px] font-bold text-ink">What this means</div>
            <p className="mt-0.5 text-[14px] text-sub">
              You&apos;re in the top 3 at {green} of {total} search points and invisible (below the top 20)
              at {red}. Coverage is strongest near the clinic and fades at the edges — more reviews and
              fresh posts widen that circle.
            </p>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2 px-1">
        <Badge tone="neutral" icon="credit-card">Scan cost: {total} checks · 1 of 4 monthly scans used</Badge>
        <p className="text-[13px] text-faint">Grid scans query Google from each point — detected {formatDate(scan.ranAt)}.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            Rank Grid
            <Badge tone="gold" icon="sparkles">Pro</Badge>
          </span>
        }
        sub="Your Google ranking sampled across a grid of nearby search points."
      />

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
