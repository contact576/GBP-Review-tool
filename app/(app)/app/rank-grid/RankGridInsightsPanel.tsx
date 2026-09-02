import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { Card, CardHeader } from "@/components/ds/Card";
import type { RankGridInsights } from "@/lib/google/rank-insights";

/**
 * The reading of the grid, in words and comparisons rather than colours.
 *
 * Every claim here is traceable to something the scan measured. Where a figure
 * was not captured — a competitor with no review count, a scan with no stored
 * coordinates — the row says so rather than showing a zero, because a zero here
 * reads as "they have no reviews", which would be a lie.
 */

function reviewGapCopy(gap: number | undefined): { text: string; tone: "danger" | "primary" | "neutral" } {
  if (gap === undefined) return { text: "Review count not captured", tone: "neutral" };
  if (gap > 0) return { text: `+${gap.toLocaleString()} more reviews than you`, tone: "danger" };
  if (gap < 0) return { text: `${Math.abs(gap).toLocaleString()} fewer reviews than you`, tone: "primary" };
  return { text: "Same review count as you", tone: "neutral" };
}

export function RankGridInsightsPanel({
  insights,
  keyword,
  businessName,
}: {
  insights: RankGridInsights;
  keyword: string;
  businessName?: string;
}) {
  const { competitors, distanceBands, weakest, strongest, own, top3ReachKm } = insights;
  const topRivals = competitors.filter((c) => c.outranks > 0).slice(0, 6);
  const measuredBands = distanceBands.filter((band) => band.points > 0);

  return (
    <div className="space-y-4">
      {/* ── What the scan means, in one paragraph ───────────────── */}
      <Card>
        <CardHeader kicker="Reading" title="What this scan says" />
        <div className="space-y-2 text-[14px] leading-relaxed text-sub">
          <p>
            Across {insights.checked} measured point{insights.checked === 1 ? "" : "s"} for{" "}
            <span className="font-semibold text-ink">“{keyword}”</span>,{" "}
            {businessName ? <span className="font-semibold text-ink">{businessName}</span> : "your business"}{" "}
            reached the top three at{" "}
            <span className="font-semibold text-ink tabular-nums">{insights.top3}</span> of them and did
            not appear at all at{" "}
            <span className="font-semibold text-ink tabular-nums">{insights.absent}</span>.
            {insights.unavailable > 0 ? (
              <>
                {" "}
                {insights.unavailable} point{insights.unavailable === 1 ? " was" : "s were"} not
                checked — Google did not respond, so {insights.unavailable === 1 ? "it is" : "they are"}{" "}
                excluded from every figure here rather than counted as a loss.
              </>
            ) : null}
          </p>
          {top3ReachKm !== null ? (
            <p>
              Your top-three visibility reaches about{" "}
              <span className="font-semibold text-ink tabular-nums">{top3ReachKm.toFixed(1)} km</span>{" "}
              from the shopfront. Past that, searchers in this scan saw competitors first.
            </p>
          ) : (
            <p>
              This scan found no point where you placed in the top three — the ranking gap is not a
              matter of distance, it applies at your own address too.
            </p>
          )}
          {weakest && strongest && weakest.direction !== strongest.direction ? (
            <p>
              You are strongest to the{" "}
              <span className="font-semibold text-ink">{strongest.label}</span> (average rank{" "}
              <span className="tabular-nums">{strongest.averageRank.toFixed(1)}</span>) and weakest to
              the <span className="font-semibold text-ink">{weakest.label}</span> (average rank{" "}
              <span className="tabular-nums">{weakest.averageRank.toFixed(1)}</span>). That is the
              direction worth targeting first.
            </p>
          ) : null}
        </div>
      </Card>

      {/* ── How far the visibility carries ──────────────────────── */}
      {measuredBands.length > 0 ? (
        <Card>
          <CardHeader kicker="Distance" title="How far your visibility carries" />
          <p className="-mt-2 mb-3 text-[13px] text-sub">
            Average ranking by distance from your business.
          </p>
          <div className="space-y-2.5">
            {measuredBands.map((band) => {
              // Rank 1 fills the bar, rank 20+ empties it.
              const pct =
                band.averageRank === null
                  ? 0
                  : Math.max(4, Math.min(100, ((21 - band.averageRank) / 20) * 100));
              return (
                <div key={band.label}>
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="font-semibold text-ink">
                      {band.label}{" "}
                      <span className="font-normal text-faint">up to {band.maxKm.toFixed(1)} km</span>
                    </span>
                    <span className="tabular-nums text-sub">
                      {band.averageRank === null ? "Not measured" : `avg #${band.averageRank.toFixed(1)}`}
                      <span className="text-faint"> · {band.top3}/{band.points} in top 3</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-primary-wash">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                      aria-hidden="true"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {/* ── Who is taking the calls, and why ────────────────────── */}
      <Card>
        <CardHeader kicker="Competitors" title="Who outranks you, and why" />
        <p className="-mt-2 mb-3 text-[13px] text-sub">
          {own?.reviewCount !== undefined
            ? `Compared against your ${own.reviewCount.toLocaleString()} reviews${
                own.rating !== undefined ? ` at ${own.rating.toFixed(1)}★` : ""
              }, as Google reported them during this scan.`
            : "Review comparison needs your own listing to appear in the scan."}
        </p>
        {topRivals.length === 0 ? (
          <p className="text-[14px] text-sub">
            No competitor outranked you at any measured point in this scan.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="kicker py-2 pr-4 font-bold">Business</th>
                  <th className="kicker py-2 pr-4 font-bold">Beats you</th>
                  <th className="kicker py-2 pr-4 font-bold">Best / avg</th>
                  <th className="kicker py-2 font-bold">Why they win</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {topRivals.map((rival) => {
                  const gap = reviewGapCopy(rival.reviewGap);
                  return (
                    <tr key={rival.key}>
                      <td className="py-2.5 pr-4">
                        <div className="font-semibold text-ink">{rival.name}</div>
                        {rival.rating !== undefined || rival.reviewCount !== undefined ? (
                          <div className="text-[12px] tabular-nums text-faint">
                            {rival.rating === undefined ? "—" : `${rival.rating.toFixed(1)}★`}
                            {rival.reviewCount === undefined
                              ? ""
                              : ` · ${rival.reviewCount.toLocaleString()} reviews`}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-sub">
                        {rival.outranks} pt{rival.outranks === 1 ? "" : "s"}
                        <span className="text-faint"> ({Math.round(rival.outrankShare * 100)}%)</span>
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-sub">
                        #{rival.bestPosition} / #{rival.averagePosition.toFixed(1)}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={cn(
                            "text-[13px]",
                            gap.tone === "danger" && "text-danger",
                            gap.tone === "primary" && "text-primary-dark",
                            gap.tone === "neutral" && "text-faint",
                          )}
                        >
                          {gap.text}
                        </span>
                        {rival.ratingGap !== undefined && rival.ratingGap !== 0 ? (
                          <span className="block text-[12px] tabular-nums text-faint">
                            {rival.ratingGap > 0 ? "+" : ""}
                            {rival.ratingGap.toFixed(1)}★ vs you
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-faint">
          <Icon name="alert" size={13} className="mt-px shrink-0" />
          Ranking is Google’s judgement, not ours. Review volume and rating are the two inputs this
          scan can see — proximity to the searcher and profile completeness also move it, and neither
          is visible from a ranking check.
        </p>
      </Card>
    </div>
  );
}
