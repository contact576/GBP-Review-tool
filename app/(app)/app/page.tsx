import Link from "next/link";
import { getData } from "@/lib/data";
import {
  currentScore, sinceJoined, sparklinePoints, needsReplyReviews,
} from "@/lib/data/selectors";
import { Card, CardHeader } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Icon } from "@/components/icons";
import { HeroCard } from "@/components/app/HeroCard";
import { DashboardStats } from "@/components/app/DashboardStats";
import { TaskCard } from "@/components/app/TaskCard";
import { LeaderboardRow, BenchmarkStrip, NeedsReplyItem } from "@/components/app/widgets";

export default async function DashboardPage() {
  const data = await getData();
  const score = currentScore(data.metrics);
  const since = sinceJoined(data.metrics);
  const tasks = data.tasks.filter((t) => t.status !== "snoozed").slice(0, 3);
  const needs = needsReplyReviews(data.reviews).slice(0, 3);
  const leaderboard = [...data.staff].sort((a, b) => b.captures - a.captures).slice(0, 3);

  const stats = {
    found: { value: since.foundYou.now, delta: since.foundYou.delta, spark: sparklinePoints(data.metrics, "foundYou") },
    contacted: { value: since.contactedYou.now, delta: since.contactedYou.delta, spark: sparklinePoints(data.metrics, "contactedYou") },
    reviews: { value: since.newReviews.now, delta: since.newReviews.delta, spark: sparklinePoints(data.metrics, "newReviews") },
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Good to see you, {data.owner.name.split(" ")[0]}</h1>
        <p className="text-[14px] text-sub">One score, three numbers, three tasks — here&apos;s where things stand.</p>
      </div>

      <HeroCard
        score={score.growth}
        reviewsScore={score.reviews}
        profileScore={score.profile}
        delta={score.delta}
        business={data.location.name}
      />

      <DashboardStats stats={stats} />

      <Card>
        <CardHeader
          kicker="Grow"
          title="This week's 3 tasks"
          action={<LinkButton href="/app/this-week" variant="ghost" size="sm" iconRight="chevron-right">All tasks</LinkButton>}
        />
        <div className="space-y-3">
          {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Needs your reply"
            action={<LinkButton href="/app/reviews" variant="ghost" size="sm" iconRight="chevron-right">Inbox</LinkButton>}
          />
          {needs.length ? (
            <div className="space-y-1">
              {needs.map((r) => (
                <NeedsReplyItem key={r.id} author={r.author} snippet={r.text} rating={r.rating} href={`/app/reviews`} />
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-[13px] text-faint">All caught up — no reviews waiting.</p>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Staff leaderboard"
            action={<LinkButton href="/app/settings/team" variant="ghost" size="sm" iconRight="chevron-right">Team</LinkButton>}
          />
          <div className="divide-y divide-hairline">
            {leaderboard.map((s, i) => <LeaderboardRow key={s.id} staff={s} rank={i + 1} />)}
          </div>
        </Card>
      </div>

      <BenchmarkStrip competitors={data.competitors} />

      <Link href="/app/report" className="flex items-center justify-between rounded-card border border-hairline bg-primary-wash/60 p-4 transition-colors hover:border-primary/40">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-btn bg-primary text-white"><Icon name="file" size={20} /></div>
          <div>
            <div className="text-[14px] font-bold text-ink">Your Growth Report is ready</div>
            <div className="text-[13px] text-sub">See the plain-English recap of the month</div>
          </div>
        </div>
        <Icon name="chevron-right" size={20} className="text-faint" />
      </Link>
    </div>
  );
}
