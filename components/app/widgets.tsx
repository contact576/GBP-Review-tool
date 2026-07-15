import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ds/misc";
import type { StaffMember, BenchmarkCompetitor } from "@/lib/data/types";

// ── Leaderboard row ─────────────────────────────────────────
export function LeaderboardRow({ staff, rank }: { staff: StaffMember; rank: number }) {
  const medal = rank === 1 ? "text-gold" : rank === 2 ? "text-faint" : rank === 3 ? "text-gold-deep" : "text-faint";
  return (
    <div className="flex items-center gap-3 py-2">
      <span className={cn("w-5 text-center text-[15px] font-bold tabular-nums", medal)}>{rank}</span>
      <div className="grid size-8 place-items-center rounded-chip bg-primary-tint text-[12px] font-bold text-primary-dark">
        {staff.avatarInitials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-ink">{staff.displayName}</div>
        <div className="text-[13px] text-faint">{staff.captures} captures</div>
      </div>
      {staff.streakDays > 0 ? (
        <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-gold-deep">
          <Icon name="flame" size={14} /> {staff.streakDays}
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
  const behind = leader && you ? leader.reviewCount - you.reviewCount : 0;

  return (
    <Link href="/app/benchmark" className="block rounded-card border border-hairline bg-card p-4 transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between">
        <div>
          <div className="kicker mb-1">Benchmark</div>
          <div className="text-[15px] font-semibold text-ink">
            You&apos;re #{rank} of {competitors.length} nearby
          </div>
          {behind > 0 ? (
            <div className="text-[14px] text-sub">{behind} reviews behind the leader</div>
          ) : (
            <div className="text-[14px] text-primary">Leading your area</div>
          )}
        </div>
        <Icon name="chevron-right" size={20} className="text-faint" />
      </div>
    </Link>
  );
}

// ── Needs-reply item ────────────────────────────────────────
export function NeedsReplyItem({ author, snippet, rating, href }: { author: string; snippet: string; rating: number; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-btn px-2 py-2 transition-colors hover:bg-primary-wash">
      <div className="grid size-9 place-items-center rounded-chip bg-primary-tint text-[12px] font-bold text-primary-dark">
        {author.split(" ").map((w) => w[0]).join("").slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold text-ink">{author}</span>
          <span className="inline-flex">
            {Array.from({ length: rating }).map((_, i) => (
              <Icon key={i} name="star-fill" size={11} className="text-star" />
            ))}
          </span>
        </div>
        <p className="truncate text-[13px] text-sub">{snippet}</p>
      </div>
      <Badge tone="gold">Reply</Badge>
    </Link>
  );
}
