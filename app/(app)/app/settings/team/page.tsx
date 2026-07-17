import { getData } from "@/lib/data";
import { Badge, EmptyState } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { LeaderboardRow } from "@/components/app/widgets";
import { formatRelative } from "@/lib/utils/format";
import { SettingsShell } from "../SettingsShell";
import { SettingsSection } from "../SettingsUI";
import { InviteStaff } from "./InviteStaff";

export default async function TeamSettingsPage() {
  const data = await getData();
  const staff = data.staff ?? [];
  const pendingInvites = (data.invites ?? []).filter((i) => i.status === "pending");
  const leaderboard = [...staff].sort((a, b) => b.captures - a.captures).slice(0, 5);

  return (
    <SettingsShell title="Team" sub="Your capture crew — who's asking and who's on a streak.">
      {/* Invite */}
      <SettingsSection title="Invite staff">
        <InviteStaff />
      </SettingsSection>

      {/* Pending invites */}
      {pendingInvites.length ? (
        <SettingsSection title="Pending invites">
          <div className="divide-y divide-hairline">
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 py-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary-dark">
                  <Icon name="mail" size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-ink">{inv.email}</div>
                  <div className="text-[13px] capitalize text-faint">
                    {inv.role} · invited {formatRelative(inv.createdAt)}
                  </div>
                </div>
                <Badge tone="gold" icon="clock">Invited</Badge>
              </div>
            ))}
          </div>
        </SettingsSection>
      ) : null}

      {/* Roster — premium hairline table */}
      <SettingsSection title="Staff members">
        {staff.length === 0 ? (
          <EmptyState
            icon="users"
            title="No team members yet"
            description="Invite a teammate or add one directly above."
          />
        ) : (
          <div className="w-full overflow-x-auto rounded-card border border-hairline">
            <table className="w-full min-w-[560px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-hairline">
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th align="right">Captures</Th>
                  <Th align="right">Streak</Th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-hairline last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="grid size-8 place-items-center rounded-chip bg-primary-tint text-[12px] font-bold text-primary-dark">
                          {s.avatarInitials}
                        </div>
                        <div>
                          <div className="font-semibold text-ink">{s.displayName}</div>
                          {s.lastActiveAt ? (
                            <div className="text-[11px] text-faint">
                              Active {formatRelative(s.lastActiveAt)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize text-sub">{s.role}</td>
                    <td className="px-4 py-3">
                      {s.active ? (
                        <Badge tone="primary" icon="check-circle">Active</Badge>
                      ) : (
                        <Badge tone="sub">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{s.captures}</td>
                    <td className="px-4 py-3 text-right">
                      {s.streakDays > 0 ? (
                        <span className="inline-flex items-center gap-0.5 font-semibold tabular-nums text-gold-deep">
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
      </SettingsSection>

      {/* Leaderboard */}
      <SettingsSection kicker="This month" title="Leaderboard">
        {leaderboard.length ? (
          <div className="divide-y divide-hairline">
            {leaderboard.map((s, i) => (
              <LeaderboardRow key={s.id} staff={s} rank={i + 1} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="users"
            title="No staff yet"
            description="Invite your first teammate above to start the leaderboard."
          />
        )}
      </SettingsSection>
    </SettingsShell>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-faint whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
