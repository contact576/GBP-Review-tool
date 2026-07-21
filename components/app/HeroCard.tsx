import { ScoreDial } from "@/components/charts/ScoreDial";
import { SubDial } from "@/components/charts/SubDial";
import { LinkButton } from "@/components/ds/Button";
import { Icon } from "@/components/icons";
import { formatRelative } from "@/lib/utils/format";
import type { DashboardScore } from "@/lib/data/dashboard";

export function HeroCard({
  score,
  business,
  nextTask,
}: {
  score: DashboardScore;
  business: string;
  nextTask?: { title: string; rationale: string; effortMins: number; impact: "reviews" | "profile" };
}) {
  const ready = score.value !== null && score.reviews !== null && score.profile !== null;
  const band = score.value === null
    ? "Waiting for data"
    : score.value >= 75
      ? "Strong momentum"
      : score.value >= 50
        ? "Building momentum"
        : "Needs attention";

  return (
    <section className="on-hero relative h-full min-h-[430px] overflow-hidden rounded-card bg-hero p-5 text-white shadow-halo sm:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-32 size-80 rounded-full bg-white/[0.06] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-primary/25 blur-3xl" />

      <div className="relative flex h-full flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="kicker text-white/55">Local Growth Score</div>
            <h2 className="mt-1 text-[20px] font-bold tracking-tight text-white">Your local growth command center</h2>
            <p className="mt-1 text-[12px] font-medium text-white/55">{business}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-chip border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[12px] font-semibold text-white/80">
            <Icon name={ready ? "shield" : "clock"} size={13} />
            {ready ? score.source : "Verified data required"}
          </span>
        </div>

        {ready ? (
          <div className="mt-6 grid flex-1 items-center gap-6 md:grid-cols-[210px_minmax(0,1fr)]">
            <div className="flex flex-col items-center">
              <ScoreDial
                value={score.value!}
                size={178}
                label={band}
                delta={score.delta ?? undefined}
                onHero
              />
              {score.lastSyncAt ? (
                <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-white/50">
                  <Icon name="refresh" size={11} /> Updated {formatRelative(score.lastSyncAt)}
                </span>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <div className="grid grid-cols-2 divide-x divide-white/10 overflow-hidden rounded-card border border-white/10 bg-white/[0.055]">
                <div className="flex items-center justify-center py-4">
                  <SubDial value={score.reviews!} label="Reviews" size={82} onHero />
                </div>
                <div className="flex items-center justify-center py-4">
                  <SubDial value={score.profile!} label="Profile" size={82} onHero />
                </div>
              </div>

              <div className="rounded-card border border-white/10 bg-white/[0.055] p-4">
                <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-primary-mint">
                  <Icon name="sparkles" size={14} /> Next best move
                </div>
                {nextTask ? (
                  <>
                    <h3 className="mt-2 text-[16px] font-bold text-white">{nextTask.title}</h3>
                    <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-white/65">{nextTask.rationale}</p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="data-chip inline-flex items-center gap-1 text-white/55">
                        <Icon name="clock" size={12} /> ~{nextTask.effortMins} min · {nextTask.impact}
                      </span>
                      <LinkButton href="/app/this-week" variant="primary" size="sm" iconRight="arrow-right">
                        Open plan
                      </LinkButton>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="mt-2 text-[16px] font-bold text-white">Keep the flywheel moving</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-white/65">Your next weekly recommendation will appear here after the data sync.</p>
                    <LinkButton href="/app/this-week" variant="primary" size="sm" className="mt-3" iconRight="arrow-right">
                      View weekly plan
                    </LinkButton>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <span className="grid size-16 place-items-center rounded-card border border-white/10 bg-white/[0.06] text-primary-mint shadow-lg">
              <Icon name="chart" size={29} />
            </span>
            <div className="mt-4 text-[46px] font-extrabold leading-none text-white/30">—</div>
            <h3 className="mt-3 text-[19px] font-bold text-white">Connect Google to calculate your score</h3>
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-white/65">
              Foundly needs a matched public listing before it can calculate a trustworthy score for {business}.
            </p>
            <LinkButton href="/onboarding/find-business" size="sm" className="mt-5" icon="google" iconRight="arrow-right">
              Find your business
            </LinkButton>
          </div>
        )}
      </div>
    </section>
  );
}
