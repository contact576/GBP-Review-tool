import { getData } from "@/lib/data";
import { Card } from "@/components/ds/Card";
import { EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon, type IconName } from "@/components/icons";
import { formatRelative } from "@/lib/utils/format";
import type { Notification } from "@/lib/data/types";
import { MarkAllRead } from "./MarkAllRead";

const KIND_ICON: Record<Notification["kind"], IconName> = {
  review: "star",
  feedback: "chat",
  delivery: "send",
  milestone: "trophy",
  system: "bell",
};

export default async function NotificationsPage() {
  const data = await getData();
  const notifications = [...data.notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        sub="Reviews, feedback, deliveries and milestones — everything worth knowing about."
        actions={<MarkAllRead unreadCount={unread} />}
      />

      {notifications.length === 0 ? (
        <Card>
          <EmptyState
            icon="bell"
            title="No notifications yet"
            description="New reviews, private feedback and milestones will show up here."
          />
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-hairline overflow-hidden">
          {notifications.map((n) => (
            <div key={n.id} className="flex items-start gap-3 px-4 py-3.5">
              <div className="relative mt-0.5 grid size-9 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary-dark">
                <Icon name={KIND_ICON[n.kind]} size={17} />
                {!n.read ? (
                  <span
                    className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-card"
                    aria-label="Unread"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`text-[15px] ${n.read ? "font-semibold text-sub" : "font-bold text-ink"}`}>
                    {n.title}
                  </span>
                  <span className="shrink-0 text-[12px] text-faint">{formatRelative(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-[14px] text-sub">{n.body}</p>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
