import Link from "next/link";
import { getData } from "@/lib/data";
import {
  currentScore, sinceJoined, sparklinePoints, needsReplyReviews,
} from "@/lib/data/selectors";
import { Card, CardHeader } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon, type IconName } from "@/components/icons";
import { HeroCard } from "@/components/app/HeroCard";
import { DashboardStats } from "@/components/app/DashboardStats";
import { TaskCard } from "@/components/app/TaskCard";
import { GoogleDataCard } from "@/components/app/GoogleDataCard";
import { LeaderboardRow, BenchmarkStrip, NeedsReplyItem } from "@/components/app/widgets";

export default async function DashboardPage() {
  const data = await getData();
  const score = currentScore(data.metrics);
  const since = sinceJoined(data.metrics);
  const tasks = data.tasks.filter((t) => t.status !== "snoozed").slice(0, 3);
  const needs = needsReplyReviews(data.reviews).slice(0, 3);
  const leaderboard = [...data.staff].sort((a, b) => b.captures - a.captures).slice(0, 3);
  const unread = data.notifications.filter((n) => !n.read).length;

  const stats = {
    found: { value: since.foundYou.now, delta: since.foundYou.delta, spark: sparklinePoints(data.metrics, "foundYou") },
    contacted: { value: since.contactedYou.now, delta: since.contactedYou.delta, spark: sparklinePoints(data.metrics, "contactedYou") },
    reviews: { value: since.newReviews.now, delta: since.newReviews.delta, spark: sparklinePoints(data.metrics, "newReviews") },
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Good to see you, ${data.owner.name.split(" ")[0]}`}
        sub={<>One score, three numbers, three tasks — here&apos;s where things stand.</>}
      />

      <HeroCard
        score={score.growth}
        reviewsScore={score.reviews}
        profileScore={score.profile}
        delta={score.delta}
        business={data.location.name}
      />

      {/* Desktop: main column + right rail. Mobile keeps the single-column order. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 xl:col-span-2">
          <GoogleDataCard data={data} />

          <DashboardStats stats={stats} />

          <Card>
            <CardHeader
              title="This week's 3 tasks"
              action={<LinkButton href="/app/this-week" variant="ghost" size="sm" iconRight="chevron-right">All tasks</LinkButton>}
            />
            <div className="space-y-3">
              {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </Card>

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
              <EmptyState
                icon="chat"
                title="All caught up"
                description="No reviews waiting on a reply right now."
              />
            )}
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-5">
          <BenchmarkStrip competitors={data.competitors} />

          <Card>
            <CardHeader
              title="Staff leaderboard"
              action={<LinkButton href="/app/settings/team" variant="ghost" size="sm" iconRight="chevron-right">Team</LinkButton>}
            />
            <div className="divide-y divide-hairline">
              {leaderboard.map((s, i) => <LeaderboardRow key={s.id} staff={s} rank={i + 1} />)}
            </div>
          </Card>

          <TeaserLink
            href="/app/report"
            icon="file"
            title="Your Growth Report is ready"
            sub="The plain-English recap of the month"
          />

          {unread > 0 ? (
            <TeaserLink
              href="/app/notifications"
              icon="bell"
              title={`${unread} unread notification${unread === 1 ? "" : "s"}`}
              sub="Reviews, deliveries and milestones"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TeaserLink({ href, icon, title, sub }: { href: string; icon: IconName; title: string; sub: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-card border border-hairline bg-primary-wash/60 p-4 transition-colors hover:border-primary/40">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-btn bg-primary text-white"><Icon name={icon} size={20} /></div>
        <div>
          <div className="text-[15px] font-bold text-ink">{title}</div>
          <div className="text-[14px] text-sub">{sub}</div>
        </div>
      </div>
      <Icon name="chevron-right" size={20} className="text-faint" />
    </Link>
  );
}
