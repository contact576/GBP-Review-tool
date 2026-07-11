import { getData } from "@/lib/data";
import { Card, CardHeader, EmptyState } from "@/components/ds";
import { Icon, type IconName } from "@/components/icons";
import { LeaderboardRow } from "@/components/app/widgets";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { pluralize } from "@/lib/utils/format";

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
  const data = await getData();
  const sorted = [...data.staff].sort((a, b) => b.captures - a.captures);
  const me = data.staff.find((s) => s.id === "stf_priya") ?? sorted[0];
  const rank = me ? sorted.findIndex((s) => s.id === me.id) + 1 : 0;
  const leader = sorted[0];
  const gapToLead = me && leader ? leader.captures - me.captures : 0;

  return (
    <div className="mx-auto w-full max-w-[540px] space-y-5 px-4 pb-28 pt-4">
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
                You&apos;re #{rank} of {data.staff.length} this month
              </div>
            </div>
            {me.streakDays > 0 ? (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-chip bg-gold-tint px-2.5 py-1 text-[13px] font-bold text-gold-deep">
                <Icon name="flame" size={16} /> {me.streakDays}
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
      ) : (
        <EmptyState icon="users" title="No staff yet" description="Captures will appear here as your team logs them." />
      )}

      <Card>
        <CardHeader kicker="This month" title="Team leaderboard" />
        {sorted.length ? (
          <div className="divide-y divide-hairline">
            {sorted.map((s, i) => (
              <LeaderboardRow key={s.id} staff={s} rank={i + 1} />
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-[13px] text-faint">No captures logged yet.</p>
        )}
      </Card>
    </div>
  );
}
