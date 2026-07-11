import { getData } from "@/lib/data";
import { monthlyVelocity } from "@/lib/data/selectors";
import { Card, CardHeader } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Badge, DataChip } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { BenchmarkBar } from "@/components/charts/Bars";
import { Sparkline } from "@/components/charts/Sparkline";
import { formatDate } from "@/lib/utils/format";

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
  const medianVel = otherVels.length
    ? otherVels[Math.floor((otherVels.length - 1) / 2)] ?? 0
    : 0;

  const detected = formatDate(new Date().toISOString());

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Benchmark</h1>
        <p className="text-[14px] text-sub">
          Where you stand against nearby physiotherapy clinics — the honest version.
        </p>
      </div>

      {/* Position line */}
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
                <p className="mt-1 text-[13px] text-sub">
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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

      {/* Velocity */}
      <Card>
        <CardHeader
          kicker="Momentum"
          title="Your review pace"
          action={
            <span className="text-[12px] text-sub">
              {yourVel}/mo · area median {medianVel}/mo
            </span>
          }
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-end gap-2">
              <span className="text-[30px] font-extrabold leading-none tabular-nums text-ink">{yourVel}</span>
              <span className="mb-1 text-[13px] text-sub">new reviews / 30 days</span>
            </div>
            <p className="mt-1 text-[13px] text-sub">
              {yourVel >= medianVel
                ? "You're keeping pace with the neighbourhood."
                : `About ${Math.max(1, medianVel - yourVel)} behind the area median each month.`}
            </p>
          </div>
          <div className="overflow-x-auto">
            <Sparkline data={velocity.map((v) => v.count)} width={320} height={64} />
            <div className="mt-1 flex justify-between text-[10px] text-faint">
              {velocity.map((v) => (
                <span key={v.label}>{v.label}</span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Gap to close */}
      <Card className="border-primary/30 bg-primary-wash/50">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary text-white">
              <Icon name="trend" size={20} />
            </div>
            <div>
              <div className="text-[15px] font-bold text-ink">Close the volume gap</div>
              <p className="mt-0.5 text-[13px] text-sub">
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
        <p className="text-[12px] text-faint">
          Based on public Google data, detected {detected}. Competitor figures are point-in-time snapshots.
        </p>
      </div>
    </div>
  );
}
