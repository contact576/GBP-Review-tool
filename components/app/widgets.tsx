import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { ProgressMeter } from "@/components/charts";
import { formatRelative } from "@/lib/utils/format";
import type { StaffMember, BenchmarkCompetitor } from "@/lib/data/types";

// ── Leaderboard row ─────────────────────────────────────────
// Gold is reserved here for the genuinely earned top spot + active streaks;
// ranks below stay neutral so the celebration keeps its voltage.
export function LeaderboardRow({ staff, rank }: { staff: StaffMember; rank: number }) {
  const top = rank === 1;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-chip text-[12px] font-bold tabular-nums",
          top ? "bg-gold-tint text-gold-deep" : "bg-primary-wash text-sub",
        )}
      >
        {rank}
      </span>
      <div className="grid size-8 shrink-0 place-items-center rounded-chip bg-primary-tint text-[12px] font-bold text-primary-dark">
        {staff.avatarInitials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-ink">{staff.displayName}</div>
        <div className="data-chip text-faint">{staff.captures} captures</div>
      </div>
      {staff.streakDays > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-chip bg-gold-tint px-2 py-0.5 text-[12px] font-semibold text-gold-deep">
          <Icon name="flame" size={13} />
          <span className="tabular-nums">{staff.streakDays}</span>
        </span>
      ) : null}
    </div>
  );
}

// ── Benchmark strip ─────────────────────────────────────────
export function BenchmarkStrip({ competitors }: { competitors: BenchmarkCompetitor[] }) {
  const you = competitors.find((c) => c.isYou);
  const sorted = [...competitors].sort((a, b) => b.reviewCount - a.reviewCount);
  const rank = you ? sorted.findIndex((c) => c.isYou) + 1 : 0;
  const leader = sorted[0];
  const youCount = you?.reviewCount ?? 0;
  const leaderCount = leader?.reviewCount ?? youCount;
  const behind = Math.max(0, leaderCount - youCount);

  return (
    <Link
      href="/app/benchmark"
      className="block rounded-card border border-hairline bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="kicker mb-1.5">Local benchmark</div>
          <div className="text-[24px] font-extrabold leading-none tracking-tight text-ink">
            <span className="tabular-nums">#{rank}</span>{" "}
            <span className="text-[15px] font-semibold text-sub">of {competitors.length} nearby</span>
          </div>
        </div>
        <Icon name="chevron-right" size={20} className="mt-1 text-faint" />
      </div>

      <div className="mt-4">
        <ProgressMeter
          value={youCount}
          max={Math.max(1, leaderCount)}
          label="Reviews vs the leader"
          valueText={`${youCount} / ${leaderCount}`}
        />
      </div>

      <div className={cn("mt-2 text-[13px]", behind > 0 ? "text-sub" : "font-medium text-primary")}>
        {behind > 0 ? (
          <>
            <span className="tabular-nums">{behind}</span> review{behind === 1 ? "" : "s"} behind the leader
          </>
        ) : (
          "Leading your area"
        )}
      </div>
    </Link>
  );
}

// ── Needs-reply row ─────────────────────────────────────────
// Command-console row: avatar + reviewer + ink stars + relative date, with a
// right-aligned green action. Hover lifts the row one notch. No gold here —
// a pending reply is a task, not an earned state.
export function NeedsReplyItem({
  author, snippet, rating, href, date,
}: {
  author: string; snippet: string; rating: number; href: string; date?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 px-2 py-2.5 transition-colors hover:bg-primary-wash"
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-chip bg-primary-tint text-[12px] font-bold text-primary-dark">
        {author.split(" ").map((w) => w[0]).join("").slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-semibold text-ink">{author}</span>
          <RatingStars rating={rating} />
        </div>
        <p className="truncate text-[13px] text-sub">{snippet}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {date ? <span className="data-chip hidden text-faint sm:inline">{formatRelative(date)}</span> : null}
        <span className="inline-flex items-center gap-1 rounded-chip bg-primary-tint px-2.5 py-1 text-[12px] font-semibold text-primary-dark transition-colors group-hover:bg-primary group-hover:text-white">
          <Icon name="send" size={12} />
          Reply
        </span>
      </div>
    </Link>
  );
}

/** Rating stars rendered in ink (never the gold star hue) for dense lists. */
function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex shrink-0" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name="star-fill"
          size={11}
          className={n <= rating ? "text-ink/55" : "text-hairline"}
        />
      ))}
    </span>
  );
}
