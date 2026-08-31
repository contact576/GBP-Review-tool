import Link from "next/link";
import { Card, CardHeader, EmptyState } from "@/components/ds";
import { Icon, type IconName } from "@/components/icons";
import { LeaderboardRow } from "@/components/app/widgets";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { pluralize } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { getStaffIdentity } from "../../staff-identity";
import { RosterNotice } from "../../RosterNotice";

function Tile({ label, value, icon }: { label: string; value: number; icon: IconName }) {
  return (
    <div className="rounded-card border border-hairline bg-card p-3 text-center shadow-sm">
      <div className="mx-auto mb-1 grid size-8 place-items-center rounded-chip bg-primary-tint text-primary-dark">
        <Icon name={icon} size={16} />
      </div>
      <div className="text-[22px] font-extrabold leading-none tabular-nums text-ink">{value}</div>
      <div className="mt-1 text-[11px] text-faint">{label}</div>
    </div>
  );
}

export default async function StaffLeaderboardPage() {
  // "me" is the signed-in account's own roster row, or null when nothing
  // links them to one — the board is never falsely personalised.
  const { staff: me, unlinkedReason, roster, rank, displayName, canManageTeam } =
    await getStaffIdentity();
  const leader = roster[0];
  const gapToLead = me && leader ? leader.captures - me.captures : 0;

  return (
    <div className="relative mx-auto w-full max-w-[540px] space-y-5 px-4 pb-28 pt-4">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Your stats</h1>
        <p className="text-[14px] text-sub">Every capture is a customer who felt seen.</p>
      </div>

      {me ? (
        <Card raised>
          <div className="flex items-center gap-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-chip bg-primary text-[16px] font-bold text-white">
              {me.avatarInitials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[18px] font-extrabold text-ink">{me.displayName}</div>
              <div className="text-[13px] text-sub">
                You&apos;re #<span className="tabular-nums">{rank}</span> of{" "}
                <span className="tabular-nums">{roster.length}</span> this month
              </div>
            </div>
            {me.streakDays > 0 ? (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-chip bg-gold-tint px-2.5 py-1 text-[13px] font-bold text-gold-deep">
                <Icon name="flame" size={16} />
                <span className="tabular-nums">{me.streakDays}</span>
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <Tile label="captures" value={me.captures} icon="check" />
            <Tile label="detected reviews" value={me.detectedReviews} icon="star-fill" />
            <Tile label="day streak" value={me.streakDays} icon="flame" />
          </div>

          <p className="mt-3 text-center text-[11px] text-faint">{MICROCOPY.detectedMatch}</p>

          <div className="mt-3 rounded-btn bg-primary-wash px-3 py-2.5 text-center text-[13px] font-medium text-primary-dark">
            {rank <= 1
              ? "You're leading the team — keep the streak alive!"
              : leader
                ? `${gapToLead} ${pluralize(gapToLead, "capture")} to catch ${leader.displayName.split(" ")[0]} — you've got this.`
                : "Log your next capture to climb the board."}
          </div>
        </Card>
      ) : unlinkedReason ? (
        <RosterNotice reason={unlinkedReason} name={displayName} canManageTeam={canManageTeam} />
      ) : (
        <EmptyState
          icon="users"
          title="No staff yet"
          description="Captures will appear here as your team logs them."
        />
      )}

      <Card>
        <CardHeader kicker="This month" title="Team leaderboard" />
        {roster.length ? (
          <div className="divide-y divide-hairline">
            {roster.map((s, i) => {
              const isMe = me?.id === s.id;
              return (
                <div
                  key={s.id}
                  aria-current={isMe ? "true" : undefined}
                  className={cn(
                    "-mx-2 flex items-center gap-2 px-2",
                    isMe && "rounded-btn bg-primary-wash",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <LeaderboardRow staff={s} rank={i + 1} />
                  </div>
                  {isMe ? (
                    <span className="shrink-0 rounded-chip bg-primary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                      You
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-4 text-center text-[13px] text-faint">No captures logged yet.</p>
        )}
        {!me && roster.length ? (
          <p className="mt-3 border-t border-hairline pt-3 text-center text-[12px] text-faint">
            You&apos;re not on this board yet — captures you send aren&apos;t credited to anyone.
          </p>
        ) : null}
      </Card>

      {/* Floating Request/Capture FAB — one-tap back to the capture flow, clear
          of the bottom tab row and the safe-area inset. Press feedback is CSS
          only, so the global reduced-motion contract disables it automatically. */}
      <Link
        href="/staff"
        aria-label="New capture"
        className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-40 grid size-14 place-items-center rounded-full bg-primary text-white shadow-halo transition-all hover:bg-primary-dark active:scale-[0.95]"
      >
        <Icon name="plus" size={26} />
      </Link>
    </div>
  );
}
