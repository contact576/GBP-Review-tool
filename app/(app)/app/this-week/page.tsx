import { getData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge, EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon, type IconName } from "@/components/icons";
import { SubDial } from "@/components/charts/SubDial";
import { TaskCard } from "@/components/app/TaskCard";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { formatRelative } from "@/lib/utils/format";
import type { AuditLog } from "@/lib/data/types";

/** Humanize an audit-log action string into a label + icon. */
function describeAction(action: string): { label: string; icon: IconName } {
  switch (action) {
    case "task.approved":
      return { label: "Task approved & published", icon: "check-circle" };
    case "review.replied":
      return { label: "Reply posted to a review", icon: "send" };
    case "customer.captured":
      return { label: "New customer captured", icon: "users" };
    case "campaign.created":
      return { label: "Campaign created", icon: "megaphone" };
    default:
      return { label: action.replace(/[._]/g, " "), icon: "file" };
  }
}

export default async function ThisWeekPage() {
  const data = await getData();
  const p = data.location.profile;

  // Active tasks for the current week (skip snoozed).
  const tasks = data.tasks.filter((t) => t.status !== "snoozed");

  // What's dragging profile health — pick the most actionable line.
  const missingDesc = Math.max(0, p.servicesTotal - p.servicesWithDescriptions);
  const drags: string[] = [];
  if (missingDesc > 0) drags.push(`${missingDesc} of ${p.servicesTotal} services still need descriptions`);
  if (p.postCount < 4) drags.push(`only ${p.postCount} posts in the last 90 days`);
  if (p.responseRate < 0.8) drags.push(`you're replying to ${Math.round(p.responseRate * 100)}% of reviews`);
  if (p.qnaCount < 3) drags.push(`just ${p.qnaCount} Q&A answered`);
  if (!p.holidayHoursSet) drags.push("holiday hours aren't set yet");
  const topDrag = drags[0] ?? "your profile is in great shape";

  // Recent publish history from the audit log, newest first.
  const history: AuditLog[] = [...data.auditLog].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="This week"
        sub="Your GBP Co-Pilot picked the highest-impact moves. Approve, and we publish for you."
      />

      {/* Profile-health summary */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="mx-auto sm:mx-0">
            <SubDial value={p.completeness} label="Profile health" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[13px] font-bold text-sub">What&apos;s dragging it</div>
            <p className="text-[16px] font-semibold text-ink">{topDrag}.</p>
            {drags.length > 1 ? (
              <ul className="mt-2 space-y-1">
                {drags.slice(1, 4).map((d) => (
                  <li key={d} className="flex items-start gap-2 text-[14px] text-sub">
                    <Icon name="chevron-right" size={14} className="mt-0.5 shrink-0 text-faint" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge tone="primary" icon="camera">{p.photoCount} photos</Badge>
              <Badge tone="primary" icon="megaphone">{p.postCount} posts</Badge>
              <Badge tone="primary" icon="chat">{p.qnaCount} Q&amp;A</Badge>
              <Badge tone="neutral" icon="check">{p.servicesWithDescriptions}/{p.servicesTotal} services described</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* This week's tasks */}
      <Card>
        <CardHeader title="This week's tasks" />
        {tasks.length ? (
          <div className="space-y-3">
            {tasks.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="sparkles"
            title="No tasks this week"
            description="You're all caught up — nothing needs your approval right now."
          />
        )}
      </Card>

      {/* Publish history */}
      <Card>
        <CardHeader title="Recently published" />
        {history.length ? (
          <ul className="divide-y divide-hairline">
            {history.map((entry) => {
              const { label, icon } = describeAction(entry.action);
              return (
                <li key={entry.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="grid size-9 shrink-0 place-items-center rounded-btn bg-primary-tint text-primary-dark">
                    <Icon name={icon} size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-ink">{label}</div>
                    <div className="text-[13px] text-sub">by {entry.actor}</div>
                  </div>
                  <span className="shrink-0 text-[12px] text-faint">{formatRelative(entry.at)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon="file"
            title="Nothing published yet"
            description="Approved tasks and posted replies will show up here."
          />
        )}
      </Card>

      {/* Compliance note */}
      <div className="flex items-start gap-3 rounded-card border border-hairline bg-primary-wash/60 p-4">
        <div className="grid size-9 shrink-0 place-items-center rounded-btn bg-primary text-white">
          <Icon name="shield" size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] text-ink">
            <span className="font-bold">Why this is safe:</span> {MICROCOPY.nameStuffBlocked}
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer text-[13px] font-semibold text-primary">More detail</summary>
            <p className="mt-1 max-w-[65ch] text-[13px] text-sub">
              Every task follows Google Business Profile policy. Nothing publishes until you approve it, and
              tasks only touch posts, photos, Q&amp;A, services and hours — never your business name.
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}
