import { ScoreDial } from "@/components/charts/ScoreDial";
import { SubDial } from "@/components/charts/SubDial";
import { LinkButton } from "@/components/ds/Button";

/**
 * Deep-green dashboard hero — the single polarity flip per view.
 *
 * White type on `#0C4A3E`, translucent sub-panels with hairline (white/10)
 * borders, the ScoreDial as the centered trust anchor, Reviews/Profile
 * sub-dials, and ONE bright-green CTA. Layered `shadow-halo` lift.
 */
export function HeroCard({
  score, reviewsScore, profileScore, delta, business,
}: {
  score: number; reviewsScore: number; profileScore: number; delta: number; business: string;
}) {
  const band = score >= 75 ? "Strong" : score >= 50 ? "Building" : "Needs work";
  const narrative =
    delta > 0
      ? "you're trending up — this week's three tasks keep the momentum spinning."
      : delta < 0
        ? "let's rebuild momentum — start with this week's three tasks."
        : "you're holding steady — this week's three tasks build momentum.";

  return (
    <section className="on-hero relative overflow-hidden rounded-card bg-hero p-6 text-white shadow-halo sm:p-8">
      {/* Faint radial highlight for depth — decorative only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-white/[0.05] blur-3xl"
      />

      <div className="relative flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:gap-10">
        {/* Score dial — the centered anchor. */}
        <div className="flex shrink-0 flex-col items-center gap-2.5 lg:w-[264px]">
          <div className="kicker text-white/55">Local Growth Score</div>
          <ScoreDial value={score} size={176} label={band} delta={delta} onHero />
        </div>

        {/* Translucent sub-panels. */}
        <div className="flex w-full flex-1 flex-col gap-4">
          <div className="grid grid-cols-2 divide-x divide-white/10 overflow-hidden rounded-btn border border-white/10 bg-white/[0.05]">
            <div className="flex items-center justify-center py-4">
              <SubDial value={reviewsScore} label="Reviews" onHero />
            </div>
            <div className="flex items-center justify-center py-4">
              <SubDial value={profileScore} label="Profile" onHero />
            </div>
          </div>

          <div className="flex flex-col items-start gap-4 rounded-btn border border-white/10 bg-white/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[14px] leading-relaxed text-white/75">
              <span className="font-semibold text-white">{business}</span> — {narrative}
            </p>
            <LinkButton
              href="/app/this-week"
              variant="primary"
              size="md"
              iconRight="arrow-right"
              className="w-full shrink-0 sm:w-auto"
            >
              See this week&apos;s plan
            </LinkButton>
          </div>
        </div>
      </div>
    </section>
  );
}
