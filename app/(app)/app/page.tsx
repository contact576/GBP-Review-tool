import Image from "next/image";
import Link from "next/link";
import { getData } from "@/lib/data";
import { buildDashboardModel } from "@/lib/data/dashboard";
import { Icon, type IconName } from "@/components/icons";
import { BrandLogo, CHANNEL_LABEL, ChannelLogo } from "@/components/icons/brands";
import { Donut } from "@/components/charts/Donut";
import { TaskCard } from "@/components/app/TaskCard";
import { GettingStartedCard } from "@/components/app/GettingStartedCard";
import { DashboardGrowthChart } from "@/components/app/DashboardGrowthChart";
import { DashboardVisibilityMap } from "@/components/app/DashboardVisibilityMap";
import { Greeting } from "@/components/app/desktop/Greeting";
import type { DashboardSignal } from "@/lib/data/dashboard";
import type { ProfileSuggestion, RequestStatus, Review, ReviewRequest } from "@/lib/data/types";
import { suggestionStatusLabel } from "@/lib/suggestions/inbox";

type DeltaTone = "up" | "down" | "neutral";

const WINDOW_DAYS = 30;

const REQUEST_STATUS: Record<RequestStatus, { label: string; cls: string }> = {
  queued: { label: "Not asked", cls: "bg-hairline/60 text-sub" },
  sent: { label: "Sent", cls: "bg-primary-wash text-sub" },
  delivered: { label: "Delivered", cls: "bg-primary-wash text-sub" },
  opened: { label: "Opened", cls: "bg-primary-tint text-primary-dark" },
  clicked: { label: "Clicked", cls: "bg-primary-tint text-primary-dark" },
  posted_google: { label: "Reviewed", cls: "bg-gold-tint text-gold-deep" },
  private_feedback: { label: "Private feedback", cls: "bg-hairline/60 text-sub" },
  suppressed: { label: "Suppressed", cls: "bg-danger-tint text-danger" },
  failed: { label: "Failed", cls: "bg-danger-tint text-danger" },
};

export default async function DashboardPage() {
  const data = await getData();
  const dashboard = buildDashboardModel(data);
  const now = Date.now();
  const windowStart = now - WINDOW_DAYS * 86_400_000;
  const priorStart = windowStart - WINDOW_DAYS * 86_400_000;

  const tasks = data.tasks.filter((task) => task.status !== "snoozed").slice(0, 4);
  const suggestions = (data.location.suggestionInbox ?? [])
    .filter((suggestion) => suggestion.status !== "dismissed" && suggestion.status !== "applied")
    .slice(0, 4);
  const liveReviews = data.reviews.filter((review) => review.durability !== "vanished");
  const recentReviews = [...liveReviews].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 5);
  const needsReply = liveReviews.filter((review) => review.needsReply).length;

  // Requests: real rows only (test sends never count towards a metric).
  const realRequests = data.requests.filter((request) => !request.isTest);
  const latestRequests = [...realRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const sentInWindow = realRequests.filter((request) => request.sentAt && Date.parse(request.sentAt) >= windowStart).length;
  const sentPrior = realRequests.filter((request) => {
    const at = request.sentAt ? Date.parse(request.sentAt) : NaN;
    return at >= priorStart && at < windowStart;
  }).length;
  const reviewedInWindow = realRequests.filter(
    (request) => request.status === "posted_google" && Date.parse(request.createdAt) >= windowStart,
  ).length;

  // Sentiment: a genuine part-of-whole of the reviews we hold.
  const positive = liveReviews.filter((review) => review.rating >= 4).length;
  const neutral = liveReviews.filter((review) => review.rating === 3).length;
  const negative = liveReviews.filter((review) => review.rating <= 2).length;

  const latestScan = [...data.rankScans].sort((a, b) => b.ranAt.localeCompare(a.ranAt))[0];
  const growthSeries = [...data.metrics]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-31)
    .map((metric) => ({ date: metric.date, value: metric.growthScore }));
  const rankedPoints = latestScan?.points.filter((point) => point.rank !== null) ?? [];
  const localPackPoints = rankedPoints.filter((point) => (point.rank ?? 99) <= 3).length;
  const reviewTrend = monthlyCounts(liveReviews.map((review) => review.publishedAt), 6);
  const inviteTrend = monthlyCounts(realRequests.flatMap((request) => (request.sentAt ? [request.sentAt] : [])), 6);

  const googleMedia = data.location.gbpSnapshot?.media ?? [];
  const googleProfileMedia =
    googleMedia.find((media) => media.category === "COVER" && media.googleUrl) ??
    googleMedia.find((media) => media.category === "PROFILE" && media.googleUrl) ??
    googleMedia.find((media) => media.category === "LOGO" && media.googleUrl) ??
    googleMedia.find((media) => media.googleUrl);
  const syncedPhone = data.location.gbpSnapshot?.location.phoneNumbers?.primaryPhone;
  const syncedWebsite = data.location.gbpSnapshot?.location.websiteUri;
  const scoreValue = dashboard.score.value;
  const firstName = data.owner.name.split(" ")[0];

  return (
    <div className="space-y-4 pb-4">
      <div className="lg:hidden">
        <h1 className="text-[22px] font-bold tracking-tight text-ink"><Greeting name={firstName ?? data.owner.name} /></h1>
        <p className="mt-0.5 text-[13px] text-sub">{data.location.name}</p>
      </div>

      {/* Section tabs — the same places GoHighLevel puts Overview / Requests / Reviews / Widgets. */}
      <nav className="tab-strip" aria-label="Reputation sections">
        <Link href="/app" aria-current="page">Overview</Link>
        <Link href="/app/requests">Requests</Link>
        <Link href="/app/reviews">Reviews</Link>
        <Link href="/app/customers">Customers</Link>
        <Link href="/app/studio">Widgets</Link>
        <Link href="/app/analytics">Analytics</Link>
      </nav>

      {!data.workspace.isDemo ? <GettingStartedCard data={data} /> : null}

      {/* ── Stat row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 lg:gap-4">
        <StatCard
          label="Invites sent"
          value={formatCompact(sentInWindow)}
          note={sentPrior === 0 && sentInWindow === 0 ? "Nothing sent in the last 30 days" : deltaCount(sentInWindow, sentPrior)}
          tone={sentPrior === 0 ? "neutral" : sentInWindow >= sentPrior ? "up" : "down"}
          href="/app/requests"
        />
        <StatCard
          label="Reviews"
          value={formatCompact(data.location.reviewCount)}
          note={dashboard.newReviews.value !== null ? `+${dashboard.newReviews.value} new in the last 30 days` : "Connect Google to track change"}
          tone={dashboard.newReviews.value !== null && dashboard.newReviews.value > 0 ? "up" : "neutral"}
          href="/app/reviews"
        />
        <StatCard
          label="Average rating"
          value={data.location.rating.toFixed(1)}
          note={data.workspace.isDemo ? "+0.2 this quarter" : "Current Google rating"}
          tone={data.workspace.isDemo ? "up" : "neutral"}
          href="/app/reviews"
          stars={data.location.rating}
        />
        <StatCard
          label="Needs reply"
          value={formatCompact(needsReply)}
          note={needsReply ? "Waiting for your reply" : "Every review has a reply"}
          tone={needsReply ? "down" : "neutral"}
          href="/app/reviews"
        />
        <StatCard
          label="Profile views"
          value={formatCompact(dashboard.foundYou.value)}
          note={deltaCopy(dashboard.foundYou)}
          tone={deltaTone(dashboard.foundYou)}
          href="/app/analytics"
        />
        <StatCard
          label="Customer actions"
          value={formatCompact(dashboard.contactedYou.value)}
          note={deltaCopy(dashboard.contactedYou)}
          tone={deltaTone(dashboard.contactedYou)}
          href="/app/analytics"
        />
      </div>

      {/* ── Charts ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,.8fr)]">
        <section className="premium-card flex flex-col" aria-labelledby="growth-title">
          <div className="panel-head">
            <div className="flex items-center gap-2">
              <h2 id="growth-title" className="panel-title">Your local growth this month</h2>
              <Icon name="alert" size={14} className="text-faint" title="A blended score of reviews, profile quality, and customer activity" />
            </div>
            <Link href="/app/analytics" className="premium-card-link">Details</Link>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-4 p-4 sm:grid-cols-[150px_minmax(0,1fr)]">
            <div>
              <div className="stat-label">Local Growth Score</div>
              <div className="display-num mt-1 text-[40px]">{scoreValue ?? "—"}</div>
              <div className="mt-1 text-[13px] font-semibold text-ink">{scoreLabel(scoreValue)}</div>
              <DeltaText value={dashboard.score.delta} suffix="pts vs prior 30 days" />
              <p className="mt-3 text-[12px] leading-relaxed text-sub">
                {dashboard.score.source}
                {dashboard.score.lastSyncAt ? ` · ${formatFreshness(dashboard.score.lastSyncAt)}` : ""}
              </p>
            </div>
            <DashboardGrowthChart data={growthSeries} />
          </div>
        </section>

        <section className="premium-card flex flex-col" aria-labelledby="trends-title">
          <div className="panel-head">
            <h2 id="trends-title" className="panel-title">Review trends</h2>
            <span className="text-[12px] text-faint">Last 6 months</span>
          </div>
          <div className="flex-1 p-4">
            <TrendBars series={[{ label: "Reviews received", values: reviewTrend, color: "bg-primary" }, { label: "Invites sent", values: inviteTrend, color: "bg-primary/30" }]} />
          </div>
        </section>

        <section className="premium-card flex flex-col" aria-labelledby="sentiment-title">
          <div className="panel-head">
            <h2 id="sentiment-title" className="panel-title">Sentiment</h2>
            <span className="text-[12px] text-faint">{liveReviews.length} reviews held</span>
          </div>
          <div className="flex flex-1 items-center justify-center p-4">
            {liveReviews.length ? (
              <Donut
                size={150}
                title="Review sentiment"
                centerValue={`${Math.round((positive / liveReviews.length) * 100)}%`}
                centerLabel="positive"
                segments={[
                  { label: "Positive (4–5★)", value: positive },
                  { label: "Neutral (3★)", value: neutral, color: "#E8A33D" },
                  { label: "Negative (1–2★)", value: negative, color: "#C4452F" },
                ]}
              />
            ) : (
              <p className="text-[13px] text-sub">No reviews imported yet.</p>
            )}
          </div>
        </section>
      </div>

      {/* ── Tables ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="premium-card flex flex-col overflow-hidden" aria-labelledby="requests-title">
          <div className="panel-head">
            <h2 id="requests-title" className="panel-title">Latest review requests</h2>
            <Link href="/app/requests" className="inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-[12px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_6px_16px_-8px_rgba(12,122,99,0.7)] hover:bg-primary-dark">
              Send request
            </Link>
          </div>
          <div className="flex-1 overflow-x-auto">
            {latestRequests.length ? (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Channel</th>
                    <th>Sent</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {latestRequests.map((request) => <RequestRow key={request.id} request={request} />)}
                </tbody>
              </table>
            ) : (
              <EmptyRow icon="send" title="No review requests yet" body="Send your first request and it will be tracked here." />
            )}
          </div>
          <div className="panel-foot">
            <Link href="/app/requests" className="premium-card-link">View all requests</Link>
            <span className="text-[12px] text-faint">{reviewedInWindow} reviewed in the last 30 days</span>
          </div>
        </section>

        <section className="premium-card flex flex-col overflow-hidden" aria-labelledby="reviews-title">
          <div className="panel-head">
            <h2 id="reviews-title" className="panel-title">Latest reviews</h2>
            <Link href="/app/reviews" className="premium-card-link">View all</Link>
          </div>
          <div className="flex-1 overflow-x-auto">
            {recentReviews.length ? (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Reviewer</th>
                    <th>Rating</th>
                    <th>Source</th>
                    <th>Date</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentReviews.map((review) => <ReviewRow key={review.id} review={review} />)}
                </tbody>
              </table>
            ) : (
              <EmptyRow icon="star" title="No reviews imported yet" body="Connect Google and your reviews appear here." />
            )}
          </div>
          <div className="panel-foot">
            <Link href="/app/reviews" className="premium-card-link">Open reviews inbox</Link>
            <span className="text-[12px] text-faint">{dashboard.newReviews.source}</span>
          </div>
        </section>
      </div>

      {/* ── Work + profile ───────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <section className="premium-card flex flex-col" aria-labelledby="moves-title">
          <div className="panel-head">
            <h2 id="moves-title" className="panel-title">This week&apos;s highest-impact moves</h2>
            <Link href="/app/this-week" className="premium-card-link">See all</Link>
          </div>
          <div className="flex-1 space-y-2 p-3">
            {suggestions.length ? (
              suggestions.map((suggestion) => <SuggestionRow key={suggestion.id} suggestion={suggestion} />)
            ) : tasks.length ? (
              tasks.map((task) => <TaskCard key={task.id} task={task} />)
            ) : (
              <div className="rounded-[14px] bg-primary/[.07] px-4 py-6 text-center">
                <Icon name="check-circle" size={20} className="mx-auto text-primary" />
                <p className="mt-2 text-[14px] font-semibold text-ink">You are clear for the week</p>
                <p className="mt-1 text-[12px] text-sub">New recommendations will appear after the next verified sync.</p>
              </div>
            )}
          </div>
        </section>

        <section className="premium-card flex flex-col" aria-labelledby="profile-title">
          <div className="panel-head">
            <h2 id="profile-title" className="panel-title">Business profile</h2>
            <Link href="/app/settings/business" className="premium-card-link">Edit</Link>
          </div>
          <div className="flex-1 p-4">
            {data.workspace.isDemo || googleProfileMedia?.googleUrl ? (
              <div className="relative h-[120px] overflow-hidden rounded-[14px] bg-primary/[.07] shadow-[0_0_0_1px_rgba(23,32,29,0.06)]">
                <Image
                  src={googleProfileMedia?.googleUrl ?? "/images/dashboard/harbourview-clinic.png"}
                  alt={googleProfileMedia
                    ? `${data.location.name} ${googleProfileMedia.category?.toLowerCase() ?? "business"} photo from Google`
                    : "Harbourview Physiotherapy reception"}
                  fill
                  priority={data.workspace.isDemo}
                  unoptimized={Boolean(googleProfileMedia)}
                  sizes="(min-width: 1280px) 320px, 100vw"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="grid h-[120px] place-items-center rounded-[14px] border border-dashed border-ink/15 bg-white/40 text-center">
                <p className="text-[12px] text-sub">Google profile photos appear after sync</p>
              </div>
            )}
            <dl className="mt-3 space-y-2 text-[13px]">
              <ProfileDetail icon="map-pin">
                <span className="text-ink">{data.location.address}</span>, {data.location.city}
              </ProfileDetail>
              {data.workspace.isDemo || syncedPhone ? <ProfileDetail icon="phone"><span className="text-ink">{syncedPhone ?? "(416) 555-0182"}</span></ProfileDetail> : null}
              <ProfileDetail icon="clock">
                <span className={data.location.profile.hoursSet ? "font-semibold text-primary-dark" : "font-semibold text-gold-deep"}>{data.location.profile.hoursSet ? "Open" : "Hours needed"}</span>
                {data.workspace.isDemo && data.location.profile.hoursSet ? " · Closes 7:00 PM" : ""}
              </ProfileDetail>
              <ProfileDetail icon="building"><span className="text-ink">{data.location.category}</span></ProfileDetail>
              {data.workspace.isDemo || syncedWebsite ? (
                <ProfileDetail icon="external">
                  <a href={syncedWebsite ?? "https://harbourviewphysio.ca"} target="_blank" rel="noreferrer" className="text-primary-dark hover:underline">
                    {syncedWebsite ? displayHostname(syncedWebsite) : "harbourviewphysio.ca"}
                  </a>
                </ProfileDetail>
              ) : null}
            </dl>
          </div>
          <div className="panel-foot">
            <span className="text-[12px] text-sub">Profile completeness</span>
            <span className="flex items-center gap-2 text-[12px] font-semibold tabular-nums text-ink">
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
                <span className="block h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, data.location.profile.completeness))}%` }} />
              </span>
              {data.location.profile.completeness}%
            </span>
          </div>
        </section>

        <section className="premium-card flex flex-col" aria-labelledby="visibility-title">
          <div className="panel-head">
            <h2 id="visibility-title" className="panel-title">Visibility in your area</h2>
            <Link href="/app/rank-grid" className="premium-card-link">Full report</Link>
          </div>
          <div className="flex-1 p-4">
            <DashboardVisibilityMap scan={latestScan} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-sub">
              <span>
                Local pack at <span className="font-semibold tabular-nums text-ink">{localPackPoints}</span> of {latestScan?.points.length ?? 0} points
                {latestScan ? ` for “${latestScan.keyword}”` : ""}
              </span>
              <span className="flex items-center gap-3">
                <Legend color="bg-primary-dark" label="Top 3" />
                <Legend color="bg-[#72A991]" label="4–10" />
                <Legend color="bg-gold" label="10+" />
              </span>
            </div>
          </div>
          <div className="panel-foot">
            <Link href="/app/rank-grid" className="premium-card-link">Open rank grid</Link>
            <span className="text-[12px] text-faint">
              {latestScan ? `${latestScan.source === "google_places" ? "Google Places" : data.workspace.isDemo ? "Sample rank scan" : "Rank scan"} · ${formatFreshness(latestScan.ranAt)}` : "No scan yet"}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────

function StatCard({
  label,
  value,
  note,
  tone,
  href,
  stars,
}: {
  label: string;
  value: string;
  note: string;
  tone: DeltaTone;
  href: string;
  stars?: number;
}) {
  return (
    <Link href={href} className="premium-card premium-card-interactive block p-4">
      <div className="stat-label">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="display-num text-[26px]">{value}</span>
        {typeof stars === "number" ? <InkStars rating={Math.round(stars)} /> : null}
      </div>
      <div className={`mt-1.5 delta-pill delta-pill-${tone} items-start whitespace-normal`}>
        {tone !== "neutral" ? <Icon name={tone === "up" ? "arrow-up" : "arrow-down"} size={11} /> : null}
        {note}
      </div>
    </Link>
  );
}

function InkStars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-px" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name={n <= rating ? "star-fill" : "star"} size={12} className={n <= rating ? "text-gold" : "text-hairline"} />
      ))}
    </span>
  );
}

function TrendBars({ series }: { series: { label: string; values: { label: string; count: number }[]; color: string }[] }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values.map((v) => v.count)));
  const months = series[0]?.values ?? [];
  const summary = series.map((s) => `${s.label}: ${s.values.map((v) => `${v.label} ${v.count}`).join(", ")}`).join(". ");
  return (
    <div role="img" aria-label={summary}>
      <div className="flex h-[150px] items-end gap-2" aria-hidden="true">
        {months.map((month, index) => (
          <div key={month.label} className="flex h-full flex-1 items-end justify-center gap-1">
            {series.map((s) => {
              const count = s.values[index]?.count ?? 0;
              return (
                <div
                  key={s.label}
                  title={`${s.label} · ${month.label}: ${count}`}
                  className={`w-full max-w-[18px] rounded-t-sm ${s.color}`}
                  style={{ height: `${Math.max(count ? 4 : 1, (count / max) * 100)}%` }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2" aria-hidden="true">
        {months.map((month) => (
          <div key={month.label} className="flex-1 text-center text-[11px] text-faint">{month.label}</div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-sub">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className={`size-2.5 rounded-sm ${s.color}`} /> {s.label}
            <span className="tabular-nums text-ink">{s.values.reduce((sum, v) => sum + v.count, 0)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function RequestRow({ request }: { request: ReviewRequest }) {
  const meta = REQUEST_STATUS[request.status];
  return (
    <tr>
      <td>
        <div className="font-semibold text-ink">{request.customerName}</div>
        {request.rating ? <div className="text-[11px] text-faint">Rated {request.rating}★</div> : null}
      </td>
      <td>
        <span className="inline-flex items-center gap-1.5 text-sub">
          <ChannelLogo channel={request.channel} size={14} /> {CHANNEL_LABEL[request.channel]}
        </span>
      </td>
      <td className="whitespace-nowrap text-sub">{request.sentAt ? formatShortDate(request.sentAt) : "—"}</td>
      <td><span className={`status-pill ${meta.cls}`}>{meta.label}</span></td>
    </tr>
  );
}

function ReviewRow({ review }: { review: Review }) {
  return (
    <tr>
      <td>
        <div className="font-semibold text-ink">{review.author}</div>
        <div className="max-w-[170px] truncate text-[12px] text-sub xl:max-w-[150px] 2xl:max-w-[240px]">{review.text}</div>
      </td>
      <td><InkStars rating={review.rating} /></td>
      <td>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sub"><BrandLogo name="google" size={14} title="" /> Google</span>
      </td>
      <td className="whitespace-nowrap text-sub">{formatShortDate(review.publishedAt)}</td>
      <td className="text-right">
        {review.reply ? (
          <span className="status-pill bg-primary-tint text-primary-dark">Replied</span>
        ) : (
          <Link href="/app/reviews" className="inline-flex h-7 items-center rounded-md border border-hairline bg-card px-2.5 text-[12px] font-semibold text-ink hover:border-primary/40 hover:bg-primary-wash">
            Respond
          </Link>
        )}
      </td>
    </tr>
  );
}

function EmptyRow({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div className="px-6 py-10 text-center">
      <Icon name={icon} size={20} className="mx-auto text-faint" />
      <p className="mt-2 text-[14px] font-semibold text-ink">{title}</p>
      <p className="mt-1 text-[12px] text-sub">{body}</p>
    </div>
  );
}

const SUGGESTION_ICON: Record<ProfileSuggestion["kind"], IconName> = {
  profile_edit: "pencil",
  local_post: "megaphone",
  media: "camera",
  owner_reply: "send",
  qna: "chat",
  research: "search",
  connection: "external",
};

function SuggestionRow({ suggestion }: { suggestion: ProfileSuggestion }) {
  const href = suggestion.status === "needs_connection"
    ? "/app/settings/integrations"
    : suggestion.status === "needs_asset" || suggestion.status === "needs_facts" || suggestion.status === "needs_evidence"
      ? "/app/settings/business"
      : "/app/this-week";
  return (
    <div className="tile-row flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap">
      <span className="icon-plate icon-plate-sm"><Icon name={SUGGESTION_ICON[suggestion.kind]} size={15} /></span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink">{suggestion.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-sub">
          <span className="status-pill bg-hairline/60 text-sub">{suggestionStatusLabel(suggestion.status)}</span>
          <span className="tabular-nums text-faint">Priority {suggestion.priorityScore}</span>
        </div>
      </div>
      <Link href={href} className="inline-flex h-7 w-full shrink-0 items-center justify-center rounded-md border border-hairline bg-card px-2.5 text-[12px] font-semibold text-ink hover:border-primary/40 hover:bg-primary-wash sm:w-auto">
        {suggestion.nextStep}
      </Link>
    </div>
  );
}

function ProfileDetail({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sub">
      <Icon name={icon} size={14} className="mt-0.5 shrink-0 text-faint" />
      <dd className="min-w-0 leading-relaxed">{children}</dd>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${color}`} /> {label}
    </span>
  );
}

function DeltaText({ value, suffix }: { value: number | null; suffix: string }) {
  if (value === null) return <p className="mt-1 text-[12px] text-faint">Awaiting a verified comparison</p>;
  const positive = value >= 0;
  return (
    <p className={`mt-1 flex items-center gap-1 text-[12px] font-semibold ${positive ? "text-primary-dark" : "text-danger"}`}>
      <Icon name={positive ? "arrow-up" : "arrow-down"} size={11} />
      {Math.abs(value)} {suffix}
    </p>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function monthlyCounts(isoDates: string[], months: number): { label: string; count: number }[] {
  const now = new Date();
  const buckets = Array.from({ length: months }, (_, offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - offset), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(d), count: 0 };
  });
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const iso of isoDates) {
    const bucket = byKey.get(iso.slice(0, 7));
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

function scoreLabel(value: number | null) {
  if (value === null) return "Not available";
  if (value >= 85) return "Excellent";
  if (value >= 70) return "Strong";
  if (value >= 55) return "Building momentum";
  return "Needs attention";
}

function formatCompact(value: number | null) {
  if (value === null) return "—";
  if (value < 1_000) return new Intl.NumberFormat("en-US").format(value);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function displayHostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function deltaCopy(signal: DashboardSignal) {
  if (signal.delta === null) return "Connect Google to track change";
  const sign = signal.delta > 0 ? "+" : "";
  return `${sign}${signal.delta}% vs prior 30 days`;
}

function deltaTone(signal: DashboardSignal): DeltaTone {
  if (signal.delta === null) return "neutral";
  return signal.delta >= 0 ? "up" : "down";
}

function deltaCount(current: number, prior: number) {
  const diff = current - prior;
  if (diff === 0) return "Same as the prior 30 days";
  return `${diff > 0 ? "+" : ""}${diff} vs prior 30 days`;
}

function formatFreshness(iso: string) {
  const elapsed = Math.max(0, Date.now() - new Date(iso).getTime());
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return "updated just now";
  if (hours < 24) return `updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `updated ${days}d ago`;
}

function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

