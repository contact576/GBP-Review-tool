import Link from "next/link";
import { getSessionAndData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge, EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon, type IconName } from "@/components/icons";
import { SubDial } from "@/components/charts/SubDial";
import { ApproveCard } from "./ApproveCard";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { formatRelative } from "@/lib/utils/format";
import type { AuditLog, ProfileSuggestion } from "@/lib/data/types";
import { suggestionStatusLabel } from "@/lib/suggestions/inbox";
import { ProfileSuggestionApproval } from "./ProfileSuggestionApproval";
import Image from "next/image";
import { isContentSuggestionPreview } from "@/lib/ai/content-studio";

/** Humanize an audit-log action string into a label + icon. */
function describeAction(action: string): { label: string; icon: IconName } {
  switch (action) {
    case "task.approved":
    case "task.completed":
      return { label: "Task marked complete", icon: "check-circle" };
    case "review.replied":
    case "review.reply_saved":
      return { label: "Reply saved in Foundly", icon: "send" };
    case "customer.captured":
      return { label: "New customer captured", icon: "users" };
    case "campaign.created":
      return { label: "Campaign created", icon: "megaphone" };
    case "profile.change_approved":
      return { label: "Google profile change approved", icon: "check-circle" };
    case "profile.change_applied":
      return { label: "Google profile change applied and verified", icon: "external" };
    case "profile.change_verification_pending":
      return { label: "Google profile change awaiting verification", icon: "clock" };
    case "profile.change_failed":
      return { label: "Google profile change needs attention", icon: "alert" };
    default:
      return { label: action.replace(/[._]/g, " "), icon: "file" };
  }
}

export default async function ThisWeekPage() {
  const { data, session } = await getSessionAndData();
  const p = data.location.profile;

  // Active tasks for the current week (skip snoozed).
  const suggestions = (data.location.suggestionInbox ?? []).filter(
    (suggestion) => suggestion.status !== "dismissed" && suggestion.status !== "applied",
  );
  const tasks = suggestions.length ? [] : data.tasks.filter((t) => t.status !== "snoozed");
  const doneCount = tasks.filter((t) => t.status === "done" || t.status === "approved").length;

  // Genuine, earned streak (real staff capture data) — the only gold moment here.
  const topStreak = data.staff.reduce((best, s) => Math.max(best, s.streakDays), 0);

  // What's dragging profile health — pick the most actionable line.
  const missingDesc = Math.max(0, p.servicesTotal - p.servicesWithDescriptions);
  const drags: string[] = [];
  if (missingDesc > 0) drags.push(`${missingDesc} of ${p.servicesTotal} services still need descriptions`);
  if (p.postCount < 4) drags.push(`only ${p.postCount} posts in the last 90 days`);
  if (p.responseRate < 0.8) drags.push(`you're replying to ${Math.round(p.responseRate * 100)}% of reviews`);
  if (p.qnaCount < 3) drags.push(`just ${p.qnaCount} Q&A answered`);
  if (!p.holidayHoursSet) drags.push("holiday hours aren't set yet");
  const topDrag = drags[0] ?? "your profile is in great shape";

  // Recent workspace activity from the audit log, newest first.
  const history: AuditLog[] = [...data.auditLog].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="This week"
        sub="Your highest-impact moves, ranked from verified evidence and held behind exact-preview approval gates."
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

      {suggestions.length ? (
        <Card>
          <CardHeader
            title="Suggestion inbox"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-chip bg-primary-wash px-2.5 py-1 data-chip text-primary-dark">
                <Icon name="sparkles" size={13} />
                {suggestions.length} evidence-backed
              </span>
            }
          />
          <div className="space-y-3">
            {suggestions.map((suggestion) => (
              <SuggestionReviewCard key={suggestion.id} suggestion={suggestion} isDemo={session.isDemo} />
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-btn border border-primary/20 bg-primary-wash px-3 py-2.5 text-[12px] leading-relaxed text-sub">
            <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-primary-dark" />
            Approve appears only after Foundly has the exact text, value, or original asset to show you. Workflow ideas and incomplete facts cannot be approved.
          </div>
        </Card>
      ) : null}

      {/* This week's tasks */}
      {tasks.length || !suggestions.length ? <Card>
        <CardHeader
          title="This week's tasks"
          action={
            tasks.length ? (
              <span className="inline-flex items-center gap-1.5 rounded-chip bg-primary-wash px-2.5 py-1 data-chip text-primary-dark">
                <Icon name="check-circle" size={13} />
                {doneCount} of {tasks.length} done
              </span>
            ) : null
          }
        />

        {/* Rationed, genuine streak celebration — gold reserved for a real win. */}
        {topStreak > 0 ? (
          <div className="mb-3 flex items-center gap-2.5 rounded-btn border border-gold/30 bg-gold-tint/50 px-3 py-2.5">
            <div className="grid size-8 shrink-0 place-items-center rounded-btn bg-gold text-ink">
              <Icon name="flame" size={16} />
            </div>
            <p className="text-[13px] text-ink">
              <span className="font-bold tabular-nums">{topStreak}-day</span> capture streak going across your
              team — approve this week&apos;s moves to keep the momentum lit.
            </p>
          </div>
        ) : null}

        {tasks.length ? (
          <div className="space-y-3">
            {tasks.map((t) => (
              <ApproveCard key={t.id} task={t} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="sparkles"
            title="No tasks this week"
            description="You're all caught up — nothing needs your approval right now."
          />
        )}
      </Card> : null}

      {/* Completion history */}
      <Card>
        <CardHeader title="Recent activity" />
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
            title="No activity yet"
            description="Completed tasks and saved replies will show up here."
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
              Suggestions can cover any applicable profile field, but identity and service changes require confirmed business facts.
              Nothing is published until the exact text, value, or asset has been shown and explicitly approved.
            </p>
          </details>
        </div>
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

function SuggestionReviewCard({ suggestion, isDemo }: { suggestion: ProfileSuggestion; isDemo: boolean }) {
  const href = suggestion.status === "needs_connection"
    ? "/app/settings/integrations"
    : suggestion.status === "needs_generation"
      ? "/app/studio"
      : "/app/settings/business";
  return (
    <article className="rounded-card border border-hairline bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-tint text-primary-dark">
          <Icon name={SUGGESTION_ICON[suggestion.kind]} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-bold text-ink">{suggestion.title}</h3>
            <Badge tone={suggestion.risk === "high" ? "gold" : suggestion.risk === "medium" ? "primary" : "neutral"}>{suggestion.risk} risk</Badge>
            <Badge tone="neutral">{suggestionStatusLabel(suggestion.status)}</Badge>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-sub">{suggestion.rationale}</p>
        </div>
        <span className="shrink-0 text-[10px] font-bold tabular-nums text-faint">Priority {suggestion.priorityScore}</span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr]">
        <div className="rounded-btn border border-hairline bg-paper px-3 py-2.5">
          <span className="kicker text-faint">Evidence</span>
          <p className="mt-1 text-[12px] text-sub">{suggestion.evidenceIds.length} linked {suggestion.evidenceIds.length === 1 ? "fact" : "facts"} from the latest audit.</p>
        </div>
        <div className="rounded-btn border border-gold/25 bg-gold-tint/30 px-3 py-2.5">
          <span className="kicker text-ink">Approval gate</span>
          <p className="mt-1 text-[12px] text-sub">{suggestion.blockers[0] ?? "An exact preview is required before approval."}</p>
        </div>
      </div>

      {suggestion.exactPreviewReady && isContentSuggestionPreview(suggestion.proposedValue) ? (
        <ContentExactPreview preview={suggestion.proposedValue} />
      ) : suggestion.exactPreviewReady && suggestion.proposedValue !== undefined ? (
        <div className="mt-3 grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr]">
          <ExactValue label="Current on Google" value={suggestion.currentValue} />
          <div className="hidden items-center text-faint sm:flex"><Icon name="arrow-right" size={18} /></div>
          <ExactValue label="Exact approved change" value={suggestion.proposedValue} recommended />
        </div>
      ) : null}

      {suggestion.exactPreviewReady ? (
        <ProfileSuggestionApproval suggestion={suggestion} isDemo={isDemo} />
      ) : (

        <div className="mt-3 flex items-center gap-3">
          <Link href={href} className="inline-flex h-9 items-center justify-center rounded-btn bg-primary-dark px-3.5 text-[12px] font-bold text-white hover:bg-primary">
            {suggestion.nextStep}
          </Link>
          <span className="text-[10px] font-semibold text-faint">No Google change will run from this step.</span>
        </div>
      )}
    </article>
  );
}

function ContentExactPreview({ preview }: { preview: import("@/lib/ai/content-studio").ContentSuggestionPreview }) {
  return (
    <div className="mt-3 overflow-hidden rounded-card border border-primary/20 bg-primary-wash/35">
      <div className={`grid ${preview.image ? "md:grid-cols-[minmax(0,1fr)_280px]" : ""}`}>
        <div className="p-4">
          <span className="kicker text-primary-dark">Exact content for approval</span>
          {preview.headline ? <h4 className="mt-1 text-[15px] font-bold text-ink">{preview.headline}</h4> : null}
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-sub">{preview.body}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="neutral">{preview.kind.replace(/_/g, " ")}</Badge>
            <Badge tone="neutral">OpenAI · {preview.generatedBy.textModel}</Badge>
            <Badge tone="primary" icon="shield">{preview.evidenceIds.length} evidence links</Badge>
          </div>
        </div>
        {preview.image ? (
          <div className="relative min-h-48 border-t border-primary/15 md:border-l md:border-t-0">
            <Image src={preview.image.src} alt={preview.image.altText} fill unoptimized sizes="280px" className="object-cover" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ExactValue({ label, value, recommended = false }: { label: string; value: unknown; recommended?: boolean }) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2);
  return (
    <div className={`min-w-0 rounded-btn border px-3 py-2.5 ${recommended ? "border-primary/25 bg-primary-wash" : "border-hairline bg-paper"}`}>
      <span className={`kicker ${recommended ? "text-primary-dark" : "text-faint"}`}>{label}</span>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-sub">{text}</pre>
    </div>
  );
}
