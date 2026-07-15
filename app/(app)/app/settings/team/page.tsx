import { getData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { LeaderboardRow } from "@/components/app/widgets";
import { formatRelative } from "@/lib/utils/format";
import { SettingsNav } from "../SettingsNav";
import { InviteStaff } from "./InviteStaff";

export default async function TeamSettingsPage() {
  const data = await getData();
  const staff = data.staff ?? [];
  const pendingInvites = (data.invites ?? []).filter((i) => i.status === "pending");
  const leaderboard = [...staff].sort((a, b) => b.captures - a.captures).slice(0, 5);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Team</h1>
        <p className="text-[14px] text-sub">Your capture crew — who&apos;s asking and who&apos;s on a streak.</p>
      </div>

      <SettingsNav />

      {/* Invite */}
      <Card>
        <CardHeader kicker="Grow the crew" title="Invite staff" />
        <InviteStaff />
      </Card>

      {/* Pending invites */}
      {pendingInvites.length ? (
        <Card>
          <CardHeader kicker="Waiting on" title="Pending invites" />
          <div className="divide-y divide-hairline">
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 py-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary-dark">
                  <Icon name="mail" size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-ink">{inv.email}</div>
                  <div className="text-[12px] capitalize text-faint">
                    {inv.role} · invited {formatRelative(inv.createdAt)}
                  </div>
                </div>
                <Badge tone="gold" icon="clock">Invited</Badge>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Roster */}
      <Card>
        <CardHeader kicker="Roster" title="Staff members" />
        {staff.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-faint">
            No team members yet — invite a teammate or add one directly above.
          </p>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-faint">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Captures</th>
                <th className="py-2 font-medium">Streak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {staff.map((s) => (
                <tr key={s.id}>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2.5">
                      <div className="grid size-8 place-items-center rounded-chip bg-primary-tint text-[12px] font-bold text-primary-dark">
                        {s.avatarInitials}
                      </div>
                      <div>
                        <div className="font-semibold text-ink">{s.displayName}</div>
                        {s.lastActiveAt ? (
                          <div className="text-[11px] text-faint">Active {formatRelative(s.lastActiveAt)}</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 capitalize text-sub">{s.role}</td>
                  <td className="py-3 pr-4">
                    {s.active ? (
                      <Badge tone="primary" icon="check-circle">Active</Badge>
                    ) : (
                      <Badge tone="sub">Inactive</Badge>
                    )}
                  </td>
                  <td className="py-3 pr-4 tabular-nums text-ink">{s.captures}</td>
                  <td className="py-3">
                    {s.streakDays > 0 ? (
                      <span className="inline-flex items-center gap-0.5 font-semibold text-gold-deep">
                        <Icon name="flame" size={14} /> {s.streakDays}d
                      </span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>

      {/* Leaderboard */}
      <Card>
        <CardHeader kicker="This month" title="Leaderboard" />
        {leaderboard.length ? (
          <div className="divide-y divide-hairline">
            {leaderboard.map((s, i) => (
              <LeaderboardRow key={s.id} staff={s} rank={i + 1} />
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-[13px] text-faint">No staff yet — invite your first teammate above.</p>
        )}
      </Card>
    </div>
  );
}
