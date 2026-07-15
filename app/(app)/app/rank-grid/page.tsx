import { getData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { EmptyState, Badge, DataChip } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { formatDate } from "@/lib/utils/format";
import { RankGridView } from "./RankGridView";

export default async function RankGridPage() {
  const data = await getData();
  const scan = (data.rankScans ?? [])[0];

  if (!scan) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-[24px] font-extrabold text-ink lg:text-[28px]">Rank Grid</h1>
          <p className="text-[15px] text-sub">Where you rank on the map, point by point.</p>
        </div>
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

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-[24px] font-extrabold text-ink lg:text-[28px]">Rank Grid</h1>
            <Badge tone="gold" icon="sparkles">Pro</Badge>
          </div>
          <p className="text-[15px] text-sub">
            Your Google ranking sampled across a grid of nearby search points.
          </p>
        </div>
      </div>

      {/* Keyword + overview */}
      <Card raised>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="kicker mb-1.5">Keyword</div>
            <span className="inline-flex items-center gap-1.5 rounded-chip border border-primary bg-primary-tint px-3 py-2 text-[13px] font-semibold text-primary-dark">
              <Icon name="search" size={14} /> {scan.keyword}
            </span>
            <p className="mt-2 text-[12px] text-faint">
              {scan.gridSize}×{scan.gridSize} grid · scanned {formatDate(scan.ranAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-card border border-hairline bg-card px-4 py-3 text-center">
              <div className="text-[24px] font-extrabold leading-none tabular-nums text-ink">
                {scan.avgRank.toFixed(1)}
              </div>
              <div className="mt-1 text-[11px] text-faint">Average rank</div>
            </div>
            <div className="rounded-card border border-hairline bg-card px-4 py-3 text-center">
              <div className="text-[24px] font-extrabold leading-none tabular-nums text-ink">
                {Math.round(scan.shareOfLocalPack * 100)}%
              </div>
              <div className="mt-1 text-[11px] text-faint">Share of local pack</div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <DataChip>{green} top-3 points</DataChip>
          <DataChip>{amber} on page</DataChip>
          <DataChip>{red} not found</DataChip>
        </div>
      </Card>

      {/* Grid / table */}
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
}
