"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";
import { Badge } from "@/components/ds/misc";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import { approveTaskAction, snoozeTaskAction } from "@/lib/actions";
import type { GbpTask, TaskKind } from "@/lib/data/types";

const KIND_ICON: Record<TaskKind, IconName> = {
  post: "megaphone", photo: "camera", qna: "chat", service: "leaf", hours: "clock", reply: "send",
};

/** Short, honest "current state" line per task kind — the "before" half of the preview. */
const BEFORE_LABEL: Record<TaskKind, string> = {
  post: "No recent post on your profile",
  photo: "This spot needs a fresh photo",
  qna: "This question is still unanswered",
  service: "This service is missing its description",
  hours: "Your hours aren't fully set",
  reply: "This review is still awaiting your reply",
};

const AFTER_LABEL: Record<TaskKind, string> = {
  post: "Suggested copy for a Google post",
  photo: "Suggested profile photo update",
  qna: "Suggested Q&A response",
  service: "Suggested service description",
  hours: "Suggested hours update",
  reply: "Suggested public reply",
};

/**
 * Premium one-tap approve-card for the weekly plan. Preserves the exact
 * approve/snooze server actions; adds a before -> after preview so the owner
 * sees the current state and what publishing changes, side by side.
 *
 * Impact badge stays quiet (primary/neutral soft) — never gold. Gold is
 * reserved for the genuine streak win surfaced at the top of the page.
 */
export function ApproveCard({ task }: { task: GbpTask }) {
  const [status, setStatus] = useState(task.status);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  const approve = () =>
    start(async () => {
      await approveTaskAction(task.id);
      setStatus("done");
      toast("Marked complete — no Google changes were published", "success", "check-circle");
    });
  const snooze = () =>
    start(async () => {
      await snoozeTaskAction(task.id);
      setStatus("snoozed");
      toast("Snoozed to next week", "info", "clock");
    });

  const done = status === "done" || status === "approved";
  const snoozed = status === "snoozed";
  const active = !done && !snoozed;
  const isReviews = task.impact === "reviews";

  return (
    <div
      className={cn(
        "rounded-card border p-4 transition-all sm:p-5",
        done ? "border-primary/30 bg-primary-wash/50" : "border-hairline bg-card hover:shadow-sm",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-btn",
            done ? "bg-primary text-white" : "bg-primary-tint text-primary-dark",
          )}
        >
          <Icon name={done ? "check" : KIND_ICON[task.kind]} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn("text-[15px] font-bold text-ink", done && "text-sub line-through")}>
              {task.title}
            </h3>
            <Badge tone={isReviews ? "primary" : "neutral"}>
              {isReviews ? "Reviews" : "Profile"}
            </Badge>
          </div>
          <p className="mt-1 text-[14px] leading-relaxed text-sub">{task.rationale}</p>
        </div>
      </div>

      {active ? (
        <>
          {/* Before -> after preview */}
          <div className="mt-3 grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1.4fr]">
            <div className="flex flex-col rounded-btn border border-hairline bg-paper px-3 py-2.5">
              <span className="kicker mb-1 text-faint">Now</span>
              <span className="text-[13px] leading-relaxed text-sub">{BEFORE_LABEL[task.kind]}</span>
            </div>
            <div
              aria-hidden="true"
              className="hidden shrink-0 items-center justify-center text-faint sm:flex"
            >
              <Icon name="arrow-right" size={18} />
            </div>
            <div className="flex flex-col rounded-btn border border-primary/25 bg-primary-wash px-3 py-2.5">
              <span className="kicker mb-1 flex items-center gap-1 text-primary-dark">
                <Icon name="check-circle" size={12} />
                Recommendation
              </span>
              <span className="text-[13px] leading-relaxed text-ink/90">{task.preview}</span>
              <span className="mt-1.5 text-[11px] font-medium text-primary-dark/70">{AFTER_LABEL[task.kind]}</span>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={approve} loading={pending} icon="check">Mark complete</Button>
            <Button size="sm" variant="ghost" onClick={snooze} disabled={pending}>Snooze</Button>
            <span className="ml-auto inline-flex items-center gap-1 data-chip text-faint">
              <Icon name="clock" size={13} />~{task.effortMins} min
            </span>
          </div>
        </>
      ) : done ? (
        <div className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-primary">
          <Icon name="check-circle" size={16} /> Done this week
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 text-[13px] text-faint">
          <Icon name="clock" size={14} /> Snoozed to next week
        </div>
      )}
    </div>
  );
}
