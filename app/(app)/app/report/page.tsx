import { getData } from "@/lib/data";
import { sinceJoined, sparklinePoints } from "@/lib/data/selectors";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge, Delta, EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon, type IconName } from "@/components/icons";
import { StatTile, Donut, type LinePoint } from "@/components/charts";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { ReportActions } from "./ReportActions";
import { ScoreTrendChart } from "./ScoreTrendChart";

export default async function ReportPage() {
  const data = await getData();
  const report = (data.reports ?? [])[0];
  const metrics = data.metrics ?? [];
  const last = metrics[metrics.length - 1];
  const startIdx = Math.max(0, metrics.length - 31);
  const start = metrics[startIdx];
  const since = sinceJoined(metrics);

  const scoreStart = start?.growthScore ?? 0;
  const scoreEnd = last?.growthScore ?? 0;

  const reviews = data.reviews ?? [];
  const recent = [...reviews].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  const bestNew = recent.find((r) => r.rating === 5) ?? recent[0];
  const repliesPosted = reviews.filter((r) => r.reply).length;

  const stats: { label: string; value: number; delta: number; spark: number[] }[] = [
    { label: MICROCOPY.foundYouLabel, value: last?.foundYou ?? since.foundYou.now, delta: since.foundYou.delta, spark: sparklinePoints(metrics, "foundYou") },
    { label: MICROCOPY.contactedYouLabel, value: last?.contactedYou ?? since.contactedYou.now, delta: since.contactedYou.delta, spark: sparklinePoints(metrics, "contactedYou") },
    { label: MICROCOPY.newReviewsLabel, value: since.newReviews.now, delta: since.newReviews.delta, spark: sparklinePoints(metrics, "newReviews") },
  ];

  // Score-movement trend (last 30 daily snapshots). Real values, gaps stay gaps.
  const scoreTrend: LinePoint[] = metrics.slice(-30).map((m) => ({ label: m.date, value: m.growthScore }));
  const scoreDelta = scoreEnd - scoreStart;

  // Review mix by rating — a genuine part-of-whole (3 tiers), never fabricated.
  const ratingMix = [5, 4, 3].map((star) => ({
    label: `${star}-star`,
    value: reviews.filter((r) => r.rating === star).length,
  }));

  const foundleyDid = [
    `Created ${data.subscription.usage.requestsSent} review requests in your workspace`,
    `Drafted ${data.subscription.usage.aiDraftsUsed} AI review & reply starting points`,
    `Detected ${data.subscription.usage.reviewsCaptured} new reviews and matched them to visits`,
    `Prepared ${repliesPosted} review replies in Foundly`,
  ];

  const nextTasks = (data.tasks ?? []).slice(0, 3);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Growth Report"
        sub={
          <>
            {report ? report.period : "Last 30 days"} · generated {report ? formatDate(report.generatedAt) : formatDate(new Date().toISOString())}
          </>
        }
      />

      {/* Headline */}
      <Card raised as="section">
        <div className="kicker mb-1.5">Your month in one line</div>
        <h2 className="text-[24px] font-extrabold leading-tight tracking-tight text-ink">
          {report?.headline ?? "Your month at a glance"}
        </h2>
        <div className="mt-4">
          <ReportActions
            initialNarrative={report?.narrative ?? "A steady month of growth across the numbers that matter."}
            business={data.location.name}
            foundYou={since.foundYou.now}
            foundDelta={since.foundYou.delta}
            contactedYou={since.contactedYou.now}
            newReviews={since.newReviews.now}
          />
        </div>
      </Card>

      {/* Action stats — boxless spec-cells with favourable-aware deltas + spark */}
      <Card>
        <CardHeader
          kicker="Last 30 days"
          title="The three numbers that matter"
          action={<span className="hidden text-[13px] text-sub sm:inline">vs previous 30 days</span>}
        />
        <div className="grid grid-cols-1 divide-y divide-hairline sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {stats.map((s, i) => (
            <StatTile
              key={s.label}
              boxless
              className={
                i === 0
                  ? "py-4 first:pt-0 sm:px-5 sm:py-0 sm:first:pl-0"
                  : i === stats.length - 1
                    ? "py-4 last:pb-0 sm:px-5 sm:py-0 sm:last:pr-0"
                    : "py-4 sm:px-5 sm:py-0"
              }
              label={s.label}
              value={s.value}
              delta={s.delta}
              spark={s.spark}
            />
          ))}
        </div>
        <p className="mt-4 border-t border-hairline pt-3 text-[12px] text-faint">{MICROCOPY.actionsNotCustomers}</p>
      </Card>

      {/* Score movement — trend line with a value + signed-delta header */}
      <Card>
        <CardHeader title="Where your score moved" />
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-[38px] font-extrabold leading-none tabular-nums tracking-tight text-ink">
                {scoreEnd}
              </span>
              <Delta value={scoreDelta} suffix=" pts" />
            </div>
            <div className="kicker mt-1 normal-case">Local Growth Score today</div>
          </div>
          <span className="data-chip text-faint">
            {scoreStart} → {scoreEnd} over 30 days
          </span>
        </div>
        <ScoreTrendChart data={scoreTrend} />
      </Card>

      {/* Review mix — genuine part-of-whole by rating + the standout review */}
      <Card>
        <CardHeader title="Reviews this period" />
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
          <Donut
            segments={ratingMix}
            centerValue={data.location.reviewCount}
            centerLabel="reviews"
            title="Review mix by rating"
          />
          <div className="grid w-full flex-1 grid-cols-3 gap-3">
            <Highlight value={since.newReviews.now} label="new reviews" icon="star" />
            <Highlight value={repliesPosted} label="replies prepared" icon="chat" />
            <Highlight value={data.location.reviewCount} label="total reviews" icon="google" />
          </div>
        </div>
        {bestNew ? (
          <figure className="mt-4 rounded-card border border-hairline bg-primary-wash/40 p-4">
            <div className="mb-1 flex items-center gap-1">
              {Array.from({ length: bestNew.rating }).map((_, i) => (
                <Icon key={i} name="star-fill" size={14} className="text-star" />
              ))}
            </div>
            <blockquote className="text-[15px] italic text-ink/90">&ldquo;{bestNew.text}&rdquo;</blockquote>
            <figcaption className="mt-2 text-[12px] font-semibold text-sub">— {bestNew.author}</figcaption>
          </figure>
        ) : null}
      </Card>

      {/* What Foundly did / next tasks */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="What Foundly did" />
          <ul className="space-y-2.5">
            {foundleyDid.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[14px] text-ink/90">
                <Icon name="check" size={16} className="mt-0.5 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Your 3 tasks" />
          {nextTasks.length ? (
            <ol className="space-y-2.5">
              {nextTasks.map((t, i) => (
                <li key={t.id} className="flex items-start gap-2.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-tint text-[12px] font-bold text-primary-dark">
                    {i + 1}
                  </span>
                  <div>
                    <div className="text-[14px] font-semibold text-ink">{t.title}</div>
                    <p className="text-[13px] text-sub">{t.rationale}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              icon="sparkles"
              title="No tasks queued"
              description="You're all caught up — nothing waiting on you."
            />
          )}
        </Card>
      </div>

      <div className="px-1 print:hidden">
        <Badge tone="neutral" icon="shield">Every figure here traces to a real action or detected review.</Badge>
      </div>
    </div>
  );
}

function Highlight({ value, label, icon }: { value: number; label: string; icon: IconName }) {
  return (
    <div className="rounded-card border border-hairline bg-card p-3 text-center">
      <Icon name={icon} size={16} className="mx-auto text-primary" />
      <div className="mt-1 text-[22px] font-extrabold leading-none tabular-nums text-ink">{formatNumber(value)}</div>
      <div className="mt-0.5 text-[12px] text-faint">{label}</div>
    </div>
  );
}
