import { getData } from "@/lib/data";
import { Card } from "@/components/ds/Card";
import { EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { MarkAllRead } from "./MarkAllRead";
import { NotificationRow } from "./NotificationRow";

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
        <Card padded={false} className="overflow-hidden">
          {/* Summary strip */}
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
            <span className="kicker normal-case">
              {unread > 0 ? `${unread} unread` : "All caught up"}
            </span>
            <span className="data-chip text-faint">{notifications.length} total</span>
          </div>

          <div className="divide-y divide-hairline">
            {notifications.map((n) => (
              <NotificationRow key={n.id} notification={n} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
