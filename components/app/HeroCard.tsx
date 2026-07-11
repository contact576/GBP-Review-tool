import { ScoreDial } from "@/components/charts/ScoreDial";
import { SubDial } from "@/components/charts/SubDial";

/** Deep-green dashboard hero anchoring the Local Growth Score. */
export function HeroCard({
  score, reviewsScore, profileScore, delta, business,
}: {
  score: number; reviewsScore: number; profileScore: number; delta: number; business: string;
}) {
  return (
    <div className="on-hero rounded-card bg-hero p-5 text-white shadow-lg sm:p-6">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="flex flex-col items-center gap-1">
          <div className="kicker text-gold">Local Growth Score</div>
          <ScoreDial value={score} size={180} label="" delta={delta} onHero />
        </div>
        <div className="flex items-center gap-6">
          <SubDial value={reviewsScore} label="Reviews" onHero />
          <SubDial value={profileScore} label="Profile" onHero />
        </div>
      </div>
      <p className="mt-4 text-center text-[13px] text-white/70 sm:text-left">
        {business} · You&apos;re trending up. Keep the loop spinning with this week&apos;s three tasks.
      </p>
    </div>
  );
}
