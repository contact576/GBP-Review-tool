import { getData } from "@/lib/data";
import { monthlyVelocity } from "@/lib/data/selectors";
import { resolveWorkspaceIndustry } from "@/lib/industries";
import { cn } from "@/lib/utils/cn";
import { Card, CardHeader } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Badge, DataChip, EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon } from "@/components/icons";
import { BenchmarkBar } from "@/components/charts/Bars";
import { StatTile } from "@/components/charts/StatTile";
import { LineArea, type LinePoint } from "@/components/charts/LineArea";
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
  const firstOther = others[0];

  // The peer noun comes from THIS workspace's own Google category / industry —
  // never a hardcoded vertical.
  const industry = resolveWorkspaceIndustry(data.workspace.vertical, {
    label: data.workspace.industryConfig?.customLabel,
    services: data.workspace.industryConfig?.customServices,
    attributes: data.workspace.industryConfig?.customAttributes,
  });
  const peers = peerNoun(
    data.location.profile.primaryCategory || data.location.category,
    industry.label,
  );
  const sub = `Where you stand against nearby ${peers} — the honest version.`;
  const provenance =
    "Competitor figures come from public Google data we have actually detected — point-in-time snapshots, not a live feed.";

  // Real workspaces start with no detected competitor set. Say so plainly
  // rather than rendering a comparison against a field that doesn't exist.
  if (!you || !firstOther) {
    return (
      <div>
        <PageHeader title="Benchmark" sub={sub} />
        <Card>
          <EmptyState
            icon="compass"
            title={
              others.length === 0
                ? "No nearby competitors detected yet"
                : "Your profile isn't in the comparison set yet"
            }
            description={
              others.length === 0
                ? `Detection is pending. Your benchmark appears once nearby ${peers} are found in public Google data — we never estimate a field.`
                : `We detected ${others.length} nearby ${peers}, but your own Google profile hasn't been matched into the set, so there is nothing honest to compare yet.`
            }
            action={
              <LinkButton href="/app/settings/integrations" icon="google">
                Connect Google
              </LinkButton>
            }
          />
        </Card>

        <div className="mt-4 flex items-center gap-2 px-1">
          <Badge tone="neutral" icon="shield">Public data</Badge>
          <p className="text-[13px] text-faint">{provenance}</p>
        </div>
      </div>
    );
  }

  const field = competitors.length;
  const byRating = [...competitors].sort((a, b) => b.rating - a.rating);
  const ratingRank = byRating.findIndex((c) => c.isYou) + 1;
  const byCount = [...competitors].sort((a, b) => b.reviewCount - a.reviewCount);
  const countRank = byCount.findIndex((c) => c.isYou) + 1;

  // Best detected competitor on each axis — seeded from firstOther so the
  // reduce is total under noUncheckedIndexedAccess.
  const ratingLeader = others.reduce((best, o) => (o.rating > best.rating ? o : best), firstOther);
  const volumeLeader = others.reduce(
    (best, o) => (o.reviewCount > best.reviewCount ? o : best),
    firstOther,
  );
  const reviewGap = Math.max(0, volumeLeader.reviewCount - you.reviewCount);

  // Every superlative below is a claim, so each one is gated on the detected
  // numbers actually supporting it. Ties never read as "highest".
  const topRated = you.rating > ratingLeader.rating;
  const tiedTopRated = you.rating === ratingLeader.rating;
  const topVolume = you.reviewCount > volumeLeader.reviewCount;
  const tiedVolume = you.reviewCount === volumeLeader.reviewCount;
  const trailsVolume = !topVolume && !tiedVolume;

  const ratingPhrase = topRated
    ? `Highest rated of the ${field} ${peers} detected nearby`
    : tiedTopRated
      ? `Tied for the highest rating among the ${field} ${peers} detected nearby`
      : `#${ratingRank} of ${field} on rating`;
  const volumePhrase = topVolume
    ? "#1 on review volume"
    : tiedVolume
      ? "tied for the most reviews"
      : `#${countRank} of ${field} on review volume`;
  const standingLine = `${ratingPhrase}, ${trailsVolume ? "but" : "and"} ${volumePhrase}${
    trailsVolume ? " — pace is where the gap is." : "."
  }`;

  // Review pace: your monthly velocity vs the set median 30-day velocity.
  const velocity = monthlyVelocity(data.reviews ?? []);
  const yourVel = you.velocity30d;
  const otherVels = [...others.map((o) => o.velocity30d)].sort((a, b) => a - b);
  const medianVel = otherVels.length ? otherVels[Math.floor((otherVels.length - 1) / 2)] ?? 0 : 0;
  const paceLine =
    yourVel === 0 && medianVel === 0
      ? `No new reviews detected for you or the nearby ${peers} in the last 30 days.`
      : yourVel > medianVel
        ? `Ahead of the area median of ${medianVel} new reviews per 30 days.`
        : yourVel === medianVel
          ? `Level with the area median of ${medianVel} new reviews per 30 days.`
          : `About ${medianVel - yourVel} behind the area median each month.`;

  // Area averages (mean of the detected peer set) for the you-vs-average card.
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const avgRating = avg(others.map((o) => o.rating));
  const avgCount = Math.round(avg(others.map((o) => o.reviewCount)));
  const avgVel = Math.round(avg(others.map((o) => o.velocity30d)));

  const paceSeries: LinePoint[] = velocity.map((v) => ({ label: v.label, value: v.count }));

  const gapTitle = trailsVolume
    ? "Close the volume gap"
    : topVolume
      ? "Hold your volume lead"
      : "Keep your review pace";
  const ratingLeadClause = topRated
    ? "You lead on rating but trail on volume. "
    : tiedTopRated
      ? "You're tied at the top on rating but trail on volume. "
      : "";
  const gapLine = trailsVolume
    ? `${ratingLeadClause}Reaching ${volumeLeader.name} means about ${reviewGap} more reviews — steady requests get you there.`
    : topVolume
      ? `You have the most reviews of the ${field} ${peers} detected nearby. Keep the request habit going to stay ahead.`
      : `You're tied for the most reviews of the ${field} ${peers} detected nearby. Keep the request habit going to pull ahead.`;

  const kpis = [
    { label: "Your rating", value: you.rating.toFixed(1) },
    { label: `Rating rank · of ${field}`, value: `#${ratingRank}` },
    { label: "Google reviews", value: you.reviewCount },
    { label: `Volume rank · of ${field}`, value: `#${countRank}` },
  ];

  return (
    <div>
      <PageHeader title="Benchmark" sub={sub} />

      <SectionNav sections={SECTIONS} />

      {/* ── Standing ──────────────────────────────────────── */}
      <section id="standing" className="scroll-mt-[128px] space-y-4 pt-4">
        <Card raised>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="kicker mb-1">Your position</div>
              <div className="text-[20px] font-extrabold leading-tight text-ink">
                You&apos;re <span className="tabular-nums">{you.rating.toFixed(1)}</span>
                <Icon name="star-fill" size={18} className="mx-1 -mt-1 inline text-star" />
                — #{ratingRank} of {field} nearby {peers} by rating
              </div>
              <p className="mt-1 text-[14px] text-sub">{standingLine}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <DataChip>{you.rating.toFixed(1)}★ rating</DataChip>
              <DataChip>{you.reviewCount} reviews</DataChip>
            </div>
          </div>
        </Card>

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
      </section>

      {/* ── Head to head ──────────────────────────────────── */}
      <section id="comparison" className="scroll-mt-[128px] space-y-4 pt-8">
        <Card>
          <CardHeader
            kicker="Head to head"
            title="You vs the area average"
            action={
              topRated ? (
                <Badge tone="primary" icon="check">Highest rated nearby</Badge>
              ) : tiedTopRated ? (
                <Badge tone="primary" icon="check">Tied for highest rated</Badge>
              ) : (
                <Badge tone="neutral" icon="chart">
                  #{ratingRank} of {field} on rating
                </Badge>
              )
            }
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
                  <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-ink">{you.rating.toFixed(1)}★</td>
                  <td className="py-2.5 text-right tabular-nums text-sub">{avgRating.toFixed(1)}★</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 text-sub">Google reviews</td>
                  <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-ink">{you.reviewCount}</td>
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
            Area average is the mean of the {others.length} nearby {peers} we detected in public Google data — point-in-time snapshots, not a live feed.
          </p>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader kicker="Rating" title={`Star rating vs nearby ${peers}`} />
            <BenchmarkBar
              label="Average rating"
              you={you.rating}
              others={others.map((o) => ({ name: o.name, value: o.rating }))}
              unit="★"
              max={5}
            />
          </Card>

          <Card>
            <CardHeader kicker="Volume" title={`Review count vs nearby ${peers}`} />
            <BenchmarkBar
              label="Total Google reviews"
              you={you.reviewCount}
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
              <p className="mt-1 text-[14px] text-sub">{paceLine}</p>
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
                <div className="text-[16px] font-bold text-ink">{gapTitle}</div>
                <p className="mt-0.5 text-[14px] text-sub">{gapLine}</p>
              </div>
            </div>
            <LinkButton href="/app/requests" icon="send" className="shrink-0">
              Send review requests
            </LinkButton>
          </div>
        </Card>

        <div className="flex items-center gap-2 px-1">
          <Badge tone="neutral" icon="shield">Public data</Badge>
          <p className="text-[13px] text-faint">{provenance}</p>
        </div>
      </section>
    </div>
  );
}

/**
 * Peer-set noun built from the workspace's own Google primary category, then
 * its industry label, then a neutral fallback — so no vertical is ever baked
 * into the copy. "Physical therapy clinic" → "physical therapy clinics",
 * "HVAC Company" → "HVAC companies".
 */
function peerNoun(category: string, industryLabel: string): string {
  const source = (category || "").trim() || industryLabel.trim();
  if (source.length === 0) return "businesses";
  const words = source.split(/\s+/).map(softLower);
  const lastIndex = words.length - 1;
  const last = words[lastIndex];
  if (last === undefined) return "businesses";
  words[lastIndex] = pluralizeNoun(last);
  return words.join(" ");
}

/** Lowercase ordinary words; leave acronyms (HVAC, MRI) as written. */
function softLower(word: string): string {
  return word.length > 1 && word === word.toUpperCase() ? word : word.toLowerCase();
}

function pluralizeNoun(word: string): string {
  const lower = word.toLowerCase();
  if (lower.endsWith("s")) return word;
  if (/[^aeiou]y$/.test(lower)) return `${word.slice(0, -1)}ies`;
  if (/(ch|sh|x|z)$/.test(lower)) return `${word}es`;
  return `${word}s`;
}
