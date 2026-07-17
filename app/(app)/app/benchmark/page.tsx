import { getData } from "@/lib/data";
import { monthlyVelocity } from "@/lib/data/selectors";
import { cn } from "@/lib/utils/cn";
import { Card, CardHeader } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Badge, DataChip } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon } from "@/components/icons";
import { BenchmarkBar } from "@/components/charts/Bars";
import { StatTile } from "@/components/charts/StatTile";
import { LineArea, type LinePoint } from "@/components/charts/LineArea";
import { formatDate } from "@/lib/utils/format";
import { SectionNav } from "./SectionNav";

const SECTIONS = [
  { id: "standing", label: "Standing" },
  { id: "comparison", label: "Head to head" },
  { id: "pace", label: "Review pace" },
  { id: "gap", label: "Close the gap" },
];

export default async function BenchmarkPage() {
  const data = await getData();
  const competitors = data.competitors ?? [];
  const you = competitors.find((c) => c.isYou);
  const others = competitors.filter((c) => !c.isYou);

  const byRating = [...competitors].sort((a, b) => b.rating - a.rating);
  const ratingRank = you ? byRating.findIndex((c) => c.isYou) + 1 : 0;
  const byCount = [...competitors].sort((a, b) => b.reviewCount - a.reviewCount);
  const countRank = you ? byCount.findIndex((c) => c.isYou) + 1 : 0;
  const leader = byCount[0];
  const reviewGap = leader && you ? Math.max(0, leader.reviewCount - you.reviewCount) : 0;

  // Review pace: your monthly velocity vs the set median 30-day velocity.
  const velocity = monthlyVelocity(data.reviews ?? []);
  const yourVel = you?.velocity30d ?? 0;
  const otherVels = [...others.map((o) => o.velocity30d)].sort((a, b) => a - b);
  const medianVel = otherVels.length ? otherVels[Math.floor((otherVels.length - 1) / 2)] ?? 0 : 0;

  // Area averages (mean of nearby clinics) for the you-vs-average card.
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const avgRating = avg(others.map((o) => o.rating));
  const avgCount = Math.round(avg(others.map((o) => o.reviewCount)));
  const avgVel = Math.round(avg(others.map((o) => o.velocity30d)));

  const paceSeries: LinePoint[] = velocity.map((v) => ({ label: v.label, value: v.count }));
  const detected = formatDate(new Date().toISOString());

  const kpis = you
    ? [
        { label: "Your rating", value: you.rating.toFixed(1) },
        { label: `Rating rank · of ${competitors.length}`, value: `#${ratingRank}` },
        { label: "Google reviews", value: you.reviewCount },
        { label: `Volume rank · of ${competitors.length}`, value: `#${countRank}` },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="Benchmark"
        sub="Where you stand against nearby physiotherapy clinics — the honest version."
      />

      <SectionNav sections={SECTIONS} />

      {/* ── Standing ──────────────────────────────────────── */}
      <section id="standing" className="scroll-mt-[128px] space-y-4 pt-4">
        <Card raised>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="kicker mb-1">Your position</div>
              {you ? (
                <>
                  <div className="text-[20px] font-extrabold leading-tight text-ink">
                    You&apos;re {you.rating.toFixed(1)}
                    <Icon name="star-fill" size={18} className="mx-1 -mt-1 inline text-star" />
                    — #{ratingRank} of {competitors.length} nearby physio clinics by rating
                  </div>
                  <p className="mt-1 text-[14px] text-sub">
                    Top-rated in your area, but #{countRank} of {competitors.length} on review volume — pace is where the gap is.
                  </p>
                </>
              ) : (
                <div className="text-[15px] text-sub">Benchmark data is being detected.</div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <DataChip>{you?.rating.toFixed(1) ?? "—"}★ rating</DataChip>
              <DataChip>{you?.reviewCount ?? 0} reviews</DataChip>
            </div>
          </div>
        </Card>

        {you ? (
          <Card>
            <div className="grid grid-cols-2 gap-y-6 sm:grid-cols-4 sm:gap-y-0 sm:divide-x sm:divide-hairline">
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
        ) : null}
      </section>

      {/* ── Head to head ──────────────────────────────────── */}
      <section id="comparison" className="scroll-mt-[128px] space-y-4 pt-8">
        <Card>
          <CardHeader
            kicker="Head to head"
            title="You vs the area average"
            action={<Badge tone="primary" icon="check">Top-rated locally</Badge>}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="kicker py-2 pr-4 font-bold">Metric</th>
                  <th className="kicker py-2 pr-4 text-right font-bold">You</th>
                  <th className="kicker py-2 text-right font-bold">Area avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                <tr>
                  <td className="py-2.5 pr-4 text-sub">Average rating</td>
                  <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-ink">{you?.rating.toFixed(1) ?? "—"}★</td>
                  <td className="py-2.5 text-right tabular-nums text-sub">{avgRating.toFixed(1)}★</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 text-sub">Google reviews</td>
                  <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-ink">{you?.reviewCount ?? 0}</td>
                  <td className="py-2.5 text-right tabular-nums text-sub">{avgCount}</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 text-sub">New reviews / 30 days</td>
                  <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-ink">{yourVel}</td>
                  <td className="py-2.5 text-right tabular-nums text-sub">{avgVel}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 border-t border-hairline pt-3 text-[12px] text-faint">
            Area average is the mean of {others.length} nearby clinics from public Google data — point-in-time snapshots, not a live feed.
          </p>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader kicker="Rating" title="Star rating vs nearby clinics" />
            <BenchmarkBar
              label="Average rating"
              you={you?.rating ?? 0}
              others={others.map((o) => ({ name: o.name, value: o.rating }))}
              unit="★"
              max={5}
            />
          </Card>

          <Card>
            <CardHeader kicker="Volume" title="Review count vs nearby clinics" />
            <BenchmarkBar
              label="Total Google reviews"
              you={you?.reviewCount ?? 0}
              others={others.map((o) => ({ name: o.name, value: o.reviewCount }))}
            />
          </Card>
        </div>
      </section>

      {/* ── Review pace ───────────────────────────────────── */}
      <section id="pace" className="scroll-mt-[128px] pt-8">
        <Card>
          <CardHeader
            kicker="Momentum"
            title="Your review pace"
            action={
              <span className="data-chip text-sub tabular-nums">
                {yourVel}/mo · area median {medianVel}/mo
              </span>
            }
          />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,220px)_1fr] lg:items-center">
            <div className="min-w-0">
              <div className="flex items-end gap-2">
                <span className="text-[38px] font-extrabold leading-none tracking-tight tabular-nums text-ink">{yourVel}</span>
                <span className="mb-1 text-[13px] text-sub">new / 30 days</span>
              </div>
              <p className="mt-1 text-[14px] text-sub">
                {yourVel >= medianVel
                  ? "You're keeping pace with the neighbourhood."
                  : `About ${Math.max(1, medianVel - yourVel)} behind the area median each month.`}
              </p>
            </div>
            <div className="min-w-0">
              <LineArea data={paceSeries} height={180} title="Monthly review pace" />
            </div>
          </div>
        </Card>
      </section>

      {/* ── Close the gap ─────────────────────────────────── */}
      <section id="gap" className="scroll-mt-[128px] space-y-4 pt-8">
        <Card className="border-primary/30 bg-primary-wash/50">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary text-white">
                <Icon name="trend" size={20} />
              </div>
              <div>
                <div className="text-[16px] font-bold text-ink">Close the volume gap</div>
                <p className="mt-0.5 text-[14px] text-sub">
                  {reviewGap > 0 && leader
                    ? `You lead on rating but trail on volume. Reaching ${leader.name} means about ${reviewGap} more reviews — steady requests get you there.`
                    : "You're leading your area on volume. Keep the request habit going to stay ahead."}
                </p>
              </div>
            </div>
            <LinkButton href="/app/requests" icon="send" className="shrink-0">
              Send review requests
            </LinkButton>
          </div>
        </Card>

        <div className="flex items-center gap-2 px-1">
          <Badge tone="neutral" icon="shield">Public data</Badge>
          <p className="text-[13px] text-faint">
            Based on public Google data, detected {detected}. Competitor figures are point-in-time snapshots.
          </p>
        </div>
      </section>
    </div>
  );
}
