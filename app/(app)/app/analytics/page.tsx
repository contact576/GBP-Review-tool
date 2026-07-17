import { getData } from "@/lib/data";
import { sinceJoined, sparklinePoints } from "@/lib/data/selectors";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon, type IconName } from "@/components/icons";
import { StatTile } from "@/components/charts/StatTile";
import { Donut, type DonutSegment } from "@/components/charts/Donut";
import { Heatmap } from "@/components/charts/Heatmap";
import { NEUTRAL_SEG } from "@/components/charts/tokens";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { formatDate } from "@/lib/utils/format";
import type { LinePoint } from "@/components/charts/LineArea";
import { SectionNav } from "./SectionNav";
import { TrendCard } from "./TrendCard";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "trends", label: "Trends" },
  { id: "breakdown", label: "Rating mix" },
  { id: "activity", label: "Activity" },
  { id: "sources", label: "Sources" },
];

interface Kpi {
  key: string;
  label: string;
  icon: IconName;
  value: number;
  delta: number;
  spark: number[];
  source: string;
}

export default async function AnalyticsPage() {
  const data = await getData();
  const metrics = data.metrics ?? [];
  const reviews = data.reviews ?? [];
  const last = metrics[metrics.length - 1];
  const since = sinceJoined(metrics);
  const joined = formatDate(data.location.joinedAt);

  const kpis: Kpi[] = [
    {
      key: "foundYou",
      label: MICROCOPY.foundYouLabel,
      icon: "eye",
      value: last?.foundYou ?? since.foundYou.now,
      delta: since.foundYou.delta,
      spark: sparklinePoints(metrics, "foundYou"),
      source: "Google Business Profile insights",
    },
    {
      key: "contactedYou",
      label: MICROCOPY.contactedYouLabel,
      icon: "phone",
      value: last?.contactedYou ?? since.contactedYou.now,
      delta: since.contactedYou.delta,
      spark: sparklinePoints(metrics, "contactedYou"),
      source: "Google Business Profile actions",
    },
    {
      key: "newReviews",
      label: MICROCOPY.newReviewsLabel,
      icon: "star",
      value: since.newReviews.now,
      delta: since.newReviews.delta,
      spark: sparklinePoints(metrics, "newReviews"),
      source: "Google reviews (detected)",
    },
  ];

  // Trend series (full 90d window; the card slices per timeframe).
  const foundSeries: LinePoint[] = metrics.map((m) => ({ label: m.date, value: m.foundYou }));
  const contactedSeries: LinePoint[] = metrics.map((m) => ({ label: m.date, value: m.contactedYou }));

  // Rating mix — a genuine part-of-whole across public Google reviews.
  const five = reviews.filter((r) => r.rating === 5).length;
  const four = reviews.filter((r) => r.rating === 4).length;
  const lower = reviews.filter((r) => r.rating <= 3).length;
  const ratingSegments: DonutSegment[] = [
    { label: "5 stars", value: five },
    { label: "4 stars", value: four },
    { label: "3 stars or lower", value: lower, color: NEUTRAL_SEG },
  ].filter((s) => s.value > 0);
  const reviewsTotal = reviews.length;

  // Profile-views activity: weeks (rows) × weekday (cols) from real foundYou.
  const dayCols = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekMap = new Map<string, { day: number; value: number }[]>();
  for (const m of metrics) {
    const d = new Date(`${m.date}T00:00:00`);
    if (Number.isNaN(d.getTime())) continue;
    const dayIdx = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
    const ws = new Date(d);
    ws.setDate(d.getDate() - dayIdx);
    const key = ws.toISOString().slice(0, 10);
    const bucket = weekMap.get(key) ?? [];
    bucket.push({ day: dayIdx, value: m.foundYou });
    weekMap.set(key, bucket);
  }
  const weekKeys = [...weekMap.keys()].sort().slice(-12);
  const heatMatrix: (number | null)[][] = weekKeys.map((k) => {
    const row: (number | null)[] = Array(7).fill(null);
    for (const cell of weekMap.get(k) ?? []) row[cell.day] = cell.value;
    return row;
  });
  const heatRowLabels = weekKeys.map((k) =>
    new Date(`${k}T00:00:00`).toLocaleString("en", { month: "short", day: "numeric" }),
  );

  return (
    <div>
      <PageHeader
        title="Analytics"
        sub={<>The three actions that matter — measured honestly, never inflated into &ldquo;customers.&rdquo;</>}
      />

      <SectionNav sections={SECTIONS} />

      {/* ── Overview KPIs ─────────────────────────────────── */}
      <section id="overview" className="scroll-mt-[128px] pt-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-btn bg-primary-wash text-primary">
            <Icon name="chart" size={15} />
          </span>
          <h2 className="text-[15px] font-bold text-ink">Last 30 days at a glance</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {kpis.map((k) => (
            <StatTile
              key={k.key}
              label={k.label}
              value={k.value}
              delta={k.delta}
              favorableWhenUp
              deltaCaption="vs prev. 30 days"
              spark={k.spark}
            />
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-faint">
          <Icon name="clock" size={13} />
          {MICROCOPY.sinceJoined} — you joined {joined}
        </p>
      </section>

      {/* ── Trends ────────────────────────────────────────── */}
      <section id="trends" className="scroll-mt-[128px] pt-8">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-btn bg-primary-wash text-primary">
            <Icon name="trend" size={15} />
          </span>
          <h2 className="text-[15px] font-bold text-ink">Trends over time</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TrendCard kicker="Profile views" label={MICROCOPY.foundYouLabel} series={foundSeries} favorableWhenUp />
          <TrendCard kicker="Calls · directions · taps" label={MICROCOPY.contactedYouLabel} series={contactedSeries} favorableWhenUp />
        </div>
      </section>

      {/* ── Rating mix + Activity ─────────────────────────── */}
      <section id="breakdown" className="scroll-mt-[128px] pt-8">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              kicker="Breakdown"
              title="Review rating mix"
              action={<Badge tone="neutral" icon="google">Public reviews</Badge>}
            />
            {reviewsTotal > 0 ? (
              <div className="flex justify-center py-2">
                <Donut
                  segments={ratingSegments}
                  centerValue={reviewsTotal}
                  centerLabel="reviews"
                  title="Review rating mix"
                />
              </div>
            ) : (
              <p className="py-8 text-center text-[14px] text-sub">No reviews detected yet.</p>
            )}
            <p className="mt-2 text-[12px] text-faint">
              Share of your {reviewsTotal} public Google reviews by star rating.
            </p>
          </Card>

          <div id="activity" className="scroll-mt-[128px]">
            <Card>
              <CardHeader kicker="Activity" title="When people find you" />
              <div className="overflow-x-auto">
                <Heatmap
                  data={heatMatrix}
                  rowLabels={heatRowLabels}
                  colLabels={dayCols}
                  title="Profile views by day"
                  unit=" views"
                />
              </div>
              <p className="mt-2 text-[12px] text-faint">
                Google profile views by weekday over the last {weekKeys.length} weeks. One green hue,
                denser = more views. Empty cells aren&apos;t yet sampled — never a fabricated zero.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ── Sources ───────────────────────────────────────── */}
      <section id="sources" className="scroll-mt-[128px] pt-8">
        <Card>
          <CardHeader kicker="Provenance" title="Sources" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="kicker py-2 pr-4 font-bold">Metric</th>
                  <th className="kicker py-2 pr-4 font-bold">Source</th>
                  <th className="kicker py-2 font-bold">Window</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {kpis.map((k) => (
                  <tr key={k.key}>
                    <td className="py-2.5 pr-4 font-semibold text-ink">{k.label}</td>
                    <td className="py-2.5 pr-4 text-sub">{k.source}</td>
                    <td className="py-2.5 text-sub tabular-nums">Last 90 days</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="mt-4 flex items-start gap-2 rounded-card border border-hairline bg-primary-wash/40 p-3">
          <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-[13px] text-sub">{MICROCOPY.actionsNotCustomers}</p>
        </div>

        <div className="mt-3 px-1">
          <Badge tone="neutral" icon="shield">No revenue guesses</Badge>
        </div>
      </section>
    </div>
  );
}
