import Image from "next/image";
import Link from "next/link";
import { getData } from "@/lib/data";
import { buildDashboardModel } from "@/lib/data/dashboard";
import { Icon, type IconName } from "@/components/icons";
import { TaskCard } from "@/components/app/TaskCard";
import { DashboardGrowthChart } from "@/components/app/DashboardGrowthChart";
import { DashboardVisibilityMap } from "@/components/app/DashboardVisibilityMap";
import type { DashboardSignal } from "@/lib/data/dashboard";
import type { ProfileSuggestion, Review } from "@/lib/data/types";
import { suggestionStatusLabel } from "@/lib/suggestions/inbox";

export default async function DashboardPage() {
  const data = await getData();
  const dashboard = buildDashboardModel(data);
  const tasks = data.tasks.filter((task) => task.status !== "snoozed").slice(0, 3);
  const suggestions = (data.location.suggestionInbox ?? [])
    .filter((suggestion) => suggestion.status !== "dismissed" && suggestion.status !== "applied")
    .slice(0, 3);
  const recentReviews = [...data.reviews]
    .filter((review) => review.durability !== "vanished")
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 3);
  const latestScan = [...data.rankScans].sort((a, b) => b.ranAt.localeCompare(a.ranAt))[0];
  const growthSeries = [...data.metrics]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-31)
    .map((metric) => ({ date: metric.date, value: metric.growthScore }));
  const rankedPoints = latestScan?.points.filter((point) => point.rank !== null) ?? [];
  const localPackPoints = rankedPoints.filter((point) => (point.rank ?? 99) <= 3).length;
  const googleMedia = data.location.gbpSnapshot?.media ?? [];
  const googleProfileMedia =
    googleMedia.find((media) => media.category === "COVER" && media.googleUrl) ??
    googleMedia.find((media) => media.category === "PROFILE" && media.googleUrl) ??
    googleMedia.find((media) => media.category === "LOGO" && media.googleUrl) ??
    googleMedia.find((media) => media.googleUrl);
  const syncedPhone = data.location.gbpSnapshot?.location.phoneNumbers?.primaryPhone;
  const syncedWebsite = data.location.gbpSnapshot?.location.websiteUri;

  return (
    <div className="space-y-5 pb-2">
      <div className="lg:hidden">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink">Good morning, {data.owner.name.split(" ")[0]}</h1>
        <p className="mt-1 text-[13px] font-semibold text-sub">{data.location.name}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.04fr)_minmax(0,.96fr)]">
        <section className="premium-card flex min-h-[314px] flex-col overflow-hidden" aria-labelledby="growth-title">
          <div className="px-5 pb-1 pt-5 sm:px-6">
            <div className="flex items-center gap-2">
              <h2 id="growth-title" className="text-[17px] font-extrabold tracking-[-0.015em] text-ink">Your local growth this month</h2>
              <Icon name="alert" size={14} className="text-faint" title="A blended score of reviews, profile quality, and customer activity" />
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-sub">Your reputation and visibility are moving in the right direction.</p>
          </div>

          <div className="grid flex-1 grid-cols-1 items-center gap-4 px-5 pb-3 pt-2 sm:grid-cols-[190px_minmax(0,1fr)] sm:px-6">
            <div>
              <div className="text-[11px] font-semibold text-sub">Local Growth Score</div>
              <div className="tnum mt-1 font-serif text-[66px] font-semibold leading-none tracking-[-0.06em] text-ink">
                {dashboard.score.value ?? "—"}
              </div>
              <div className="mt-2 text-[13px] font-extrabold text-primary-dark">{scoreLabel(dashboard.score.value)}</div>
              <DeltaLine value={dashboard.score.delta} suffix="pts vs prior 30 days" />
            </div>
            <DashboardGrowthChart data={growthSeries} />
          </div>

          <CardFooter
            href="/app/analytics"
            label="View growth insights"
            meta={`${dashboard.score.source}${dashboard.score.lastSyncAt ? ` · ${formatFreshness(dashboard.score.lastSyncAt)}` : ""}`}
          />
        </section>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <KpiCard
            icon="star"
            value={data.location.rating.toFixed(1)}
            label="Rating"
            delta={data.workspace.isDemo ? "+0.2 this quarter" : "Current Google rating"}
            href="/app/reviews"
            linkLabel="View rating details"
          />
          <KpiCard
            icon="chat"
            value={formatCompact(data.location.reviewCount)}
            label="Reviews"
            delta={dashboard.newReviews.value !== null ? `+${dashboard.newReviews.value} in the rolling window` : "Connect Google to track change"}
            href="/app/reviews"
            linkLabel="Read recent reviews"
          />
          <KpiCard
            icon="eye"
            value={formatCompact(dashboard.foundYou.value)}
            label="Profile views"
            delta={deltaCopy(dashboard.foundYou)}
            href="/app/analytics"
            linkLabel="Explore visibility"
          />
          <KpiCard
            icon="phone"
            value={formatCompact(dashboard.contactedYou.value)}
            label="Customer actions"
            delta={deltaCopy(dashboard.contactedYou)}
            href="/app/analytics"
            linkLabel="See action details"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,.88fr)]">
        <section className="premium-card overflow-hidden" aria-labelledby="moves-title">
          <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-gold"><Icon name="sparkles" size={17} /></span>
                <h2 id="moves-title" className="text-[16px] font-extrabold tracking-[-0.01em] text-ink">This week&apos;s highest-impact moves</h2>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-sub">Three focused actions selected from your latest evidence audit.</p>
            </div>
            <span className="hidden items-center gap-1 text-[10px] font-semibold text-faint sm:flex">
              Why these? <Icon name="alert" size={13} title="Recommendations are based on detected gaps and recent activity" />
            </span>
          </div>

          <div className="space-y-2 px-4 pb-4 sm:px-5">
            {suggestions.length ? (
              suggestions.map((suggestion) => <SuggestionCard key={suggestion.id} suggestion={suggestion} />)
            ) : tasks.length ? (
              tasks.map((task) => <TaskCard key={task.id} task={task} />)
            ) : (
              <div className="rounded-[10px] border border-primary/20 bg-primary-wash p-5 text-center">
                <Icon name="check-circle" size={22} className="mx-auto text-primary" />
                <p className="mt-2 text-[13px] font-bold text-ink">You are clear for the week</p>
                <p className="mt-1 text-[11px] text-sub">New recommendations will appear after the next verified sync.</p>
              </div>
            )}
          </div>
          <CardFooter href="/app/this-week" label="See all recommendations" />
        </section>

        <section className="premium-card overflow-hidden" aria-labelledby="profile-title">
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <h2 id="profile-title" className="text-[16px] font-extrabold tracking-[-0.01em] text-ink">Business profile</h2>
            <Link href="/app/settings/business" className="premium-card-link inline-flex items-center gap-1.5">
              <Icon name="pencil" size={13} /> Edit profile
            </Link>
          </div>

          <div className="grid gap-4 px-5 pb-4 sm:grid-cols-[44%_1fr]">
            {data.workspace.isDemo || googleProfileMedia?.googleUrl ? (
              <div className="relative min-h-[154px] overflow-hidden rounded-[9px] bg-primary-wash">
                <Image
                  src={googleProfileMedia?.googleUrl ?? "/images/dashboard/harbourview-clinic.png"}
                  alt={googleProfileMedia
                    ? `${data.location.name} ${googleProfileMedia.category?.toLowerCase() ?? "business"} photo from Google`
                    : "Harbourview Physiotherapy reception"}
                  fill
                  priority={data.workspace.isDemo}
                  unoptimized={Boolean(googleProfileMedia)}
                  sizes="(min-width: 1280px) 240px, (min-width: 640px) 44vw, 100vw"
                  className="object-cover"
                />
                {googleProfileMedia?.attribution?.displayName ? (
                  <span className="absolute bottom-2 left-2 rounded bg-black/65 px-2 py-1 text-[8px] font-semibold text-white">
                    Photo: {googleProfileMedia.attribution.displayName}
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="grid min-h-[154px] place-items-center rounded-[9px] border border-dashed border-hairline bg-primary-wash text-center">
                <div>
                  <Icon name="camera" size={21} className="mx-auto text-primary" />
                  <p className="mt-2 text-[10px] font-semibold text-sub">Google profile photos appear after sync</p>
                </div>
              </div>
            )}

            <div className="space-y-2.5 py-0.5 text-[11px] text-sub">
              <ProfileDetail icon="map-pin">
                <span className="font-semibold text-ink">{data.location.address}</span><br />{data.location.city}
              </ProfileDetail>
              {data.workspace.isDemo || syncedPhone ? <ProfileDetail icon="phone"><span className="font-semibold text-ink">{syncedPhone ?? "(416) 555-0182"}</span></ProfileDetail> : null}
              <ProfileDetail icon="clock">
                <span className="font-bold text-primary">{data.location.profile.hoursSet ? "Open" : "Hours needed"}</span>
                {data.workspace.isDemo && data.location.profile.hoursSet ? " · Closes 7:00 PM" : ""}
              </ProfileDetail>
              <ProfileDetail icon="building"><span className="font-semibold text-ink">{data.location.category}</span></ProfileDetail>
              {data.workspace.isDemo || syncedWebsite ? (
                <ProfileDetail icon="external">
                  <a href={syncedWebsite ?? "https://harbourviewphysio.ca"} target="_blank" rel="noreferrer" className="font-semibold text-primary-dark hover:underline">
                    {syncedWebsite ? displayHostname(syncedWebsite) : "harbourviewphysio.ca"}
                  </a>
                </ProfileDetail>
              ) : null}
            </div>
          </div>
          <CardFooter href="/app/settings/business" label="See full profile" meta={`${data.location.profile.completeness}% complete`} />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.04fr)_minmax(0,.96fr)]">
        <section className="premium-card overflow-hidden" aria-labelledby="reviews-title">
          <div className="flex items-center justify-between px-5 pb-2 pt-5">
            <h2 id="reviews-title" className="text-[16px] font-extrabold tracking-[-0.01em] text-ink">Recent reviews</h2>
            <Link href="/app/reviews" className="premium-card-link">View all</Link>
          </div>

          {recentReviews.length ? (
            <div className="divide-y divide-hairline px-5">
              {recentReviews.map((review, index) => <RecentReviewRow key={review.id} review={review} index={index} />)}
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <Icon name="star" size={22} className="mx-auto text-gold" />
              <p className="mt-2 text-[12px] font-bold text-ink">No reviews imported yet</p>
            </div>
          )}
          <CardFooter href="/app/reviews" label="See all reviews" meta={dashboard.newReviews.source} />
        </section>

        <section className="premium-card overflow-hidden" aria-labelledby="visibility-title">
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <h2 id="visibility-title" className="text-[16px] font-extrabold tracking-[-0.01em] text-ink">Visibility in your area</h2>
            <Link href="/app/rank-grid" className="premium-card-link">View full report</Link>
          </div>

          <div className="grid gap-4 px-5 pb-4 sm:grid-cols-[150px_minmax(0,1fr)]">
            <div className="flex flex-col justify-between py-1">
              <div>
                <p className="text-[12px] font-bold leading-relaxed text-ink">
                  You rank in the local pack at <span className="font-serif text-[22px] text-primary-dark">{localPackPoints}</span> of {latestScan?.points.length ?? 0} grid points
                </p>
                <p className="mt-1.5 text-[10px] leading-relaxed text-sub">for “{latestScan?.keyword ?? "your primary keyword"}”</p>
              </div>
              <div className="mt-4 space-y-1.5 text-[9px] font-semibold text-sub">
                <Legend color="bg-primary-dark" label="Top 3" />
                <Legend color="bg-[#72A991]" label="Ranks 4–10" />
                <Legend color="bg-gold" label="Outside top 10" />
              </div>
            </div>
            <DashboardVisibilityMap scan={latestScan} />
          </div>
          <CardFooter
            href="/app/rank-grid"
            label="Open local rank grid"
            meta={latestScan ? `${latestScan.source === "google_places" ? "Google Places" : data.workspace.isDemo ? "Sample rank scan" : "Rank scan"} · ${formatFreshness(latestScan.ranAt)}` : "No scan yet"}
          />
        </section>
      </div>
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

function SuggestionCard({ suggestion }: { suggestion: ProfileSuggestion }) {
  const href = suggestion.status === "needs_connection"
    ? "/app/settings/integrations"
    : suggestion.status === "needs_asset" || suggestion.status === "needs_facts" || suggestion.status === "needs_evidence"
      ? "/app/settings/business"
      : "/app/this-week";
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-hairline bg-card px-3 py-2.5 transition-all hover:border-primary/20 hover:shadow-sm sm:px-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-wash text-primary-dark">
        <Icon name={SUGGESTION_ICON[suggestion.kind]} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[13px] font-bold text-ink sm:text-[14px]">{suggestion.title}</h3>
        <p className="mt-0.5 line-clamp-1 text-[11px] leading-relaxed text-sub sm:text-[12px]">{suggestion.rationale}</p>
      </div>
      <div className="hidden min-w-[96px] text-right sm:block">
        <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-faint">{suggestionStatusLabel(suggestion.status)}</p>
        <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-sub">Priority {suggestion.priorityScore}</p>
      </div>
      <Link href={href} className="inline-flex h-8 shrink-0 items-center justify-center rounded-[8px] bg-primary-dark px-3 text-[10px] font-bold text-white hover:bg-primary">
        {suggestion.nextStep}
      </Link>
    </div>
  );
}

function KpiCard({
  icon,
  value,
  label,
  delta,
  href,
  linkLabel,
}: {
  icon: IconName;
  value: string;
  label: string;
  delta: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <section className="premium-card flex min-h-[150px] flex-col overflow-hidden">
      <div className="flex flex-1 items-start gap-3 px-4 pb-3 pt-4 sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-wash text-primary-dark">
          <Icon name={icon} size={16} />
        </span>
        <div className="min-w-0">
          <div className="tnum font-serif text-[31px] font-semibold leading-none tracking-[-0.04em] text-ink">{value}</div>
          <div className="mt-1 text-[11px] font-bold text-sub">{label}</div>
          <div className="mt-2 line-clamp-1 text-[9px] font-semibold text-primary">{delta}</div>
        </div>
      </div>
      <CardFooter href={href} label={linkLabel} compact />
    </section>
  );
}

function CardFooter({
  href,
  label,
  meta,
  compact,
}: {
  href: string;
  label: string;
  meta?: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 border-t border-hairline ${compact ? "px-4 py-2.5 sm:px-5" : "px-5 py-3 sm:px-6"}`}>
      <Link href={href} className="premium-card-link inline-flex items-center gap-1.5">
        {label} <Icon name="arrow-right" size={12} />
      </Link>
      {meta ? <span className="max-w-[55%] truncate text-right text-[9px] font-medium text-faint">{meta}</span> : null}
    </div>
  );
}

function ProfileDetail({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon name={icon} size={14} className="mt-0.5 shrink-0 text-faint" />
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
}

function RecentReviewRow({ review, index }: { review: Review; index: number }) {
  const palette = ["bg-[#DCE9E3] text-primary-dark", "bg-gold-tint text-gold-deep", "bg-[#E7E2F0] text-[#61517B]"];
  const initials = review.author.split(" ").map((word) => word[0]).join("").slice(0, 2);

  return (
    <div className="flex items-center gap-3 py-3">
      <span className={`grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-extrabold ${palette[index % palette.length]}`}>
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[12px] font-extrabold text-ink">{review.author}</span>
          <span className="shrink-0 text-[9px] font-medium text-faint">{formatReviewDate(review.publishedAt)}</span>
        </div>
        <div className="mt-0.5 flex text-gold" aria-label={`${review.rating} out of 5 stars`}>
          {Array.from({ length: 5 }, (_, star) => (
            <Icon key={star} name={star < review.rating ? "star-fill" : "star"} size={10} />
          ))}
        </div>
        <p className="mt-1 truncate text-[10px] leading-relaxed text-sub">“{review.text}”</p>
      </div>
      <Link href="/app/reviews" aria-label={`Open ${review.author}'s review`} className="grid size-7 shrink-0 place-items-center rounded-full text-faint hover:bg-primary-wash hover:text-ink">
        <Icon name="more" size={15} />
      </Link>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`size-2.5 rounded-full ${color}`} /> {label}
    </div>
  );
}

function DeltaLine({ value, suffix }: { value: number | null; suffix: string }) {
  if (value === null) return <p className="mt-2 text-[10px] font-semibold text-faint">Awaiting verified comparison</p>;
  const positive = value >= 0;
  return (
    <p className={`mt-2 flex items-center gap-1 text-[10px] font-bold ${positive ? "text-primary" : "text-danger"}`}>
      <Icon name={positive ? "arrow-up" : "arrow-down"} size={11} />
      {Math.abs(value)} {suffix}
    </p>
  );
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

function formatFreshness(iso: string) {
  const elapsed = Math.max(0, Date.now() - new Date(iso).getTime());
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return "updated just now";
  if (hours < 24) return `updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `updated ${days}d ago`;
}

function formatReviewDate(iso: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 35) return `${Math.floor(days / 7)} weeks ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}
