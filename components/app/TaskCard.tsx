"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";
import { Badge } from "@/components/ds/misc";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import { approveTaskAction, snoozeTaskAction } from "@/lib/actions";
import type { GbpTask } from "@/lib/data/types";

const KIND_ICON: Record<GbpTask["kind"], IconName> = {
  post: "megaphone", photo: "camera", qna: "chat", service: "leaf", hours: "clock", reply: "send",
};

export function TaskCard({ task }: { task: GbpTask }) {
  const [status, setStatus] = useState(task.status);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  const approve = () =>
    start(async () => {
      await approveTaskAction(task.id);
      setStatus("done");
      toast("Approved — will publish when your Google profile connection is live", "success", "check-circle");
    });
  const snooze = () =>
    start(async () => {
      await snoozeTaskAction(task.id);
      setStatus("snoozed");
      toast("Snoozed to next week", "info", "clock");
    });

  const done = status === "done";

  return (
    <div className={cn("rounded-card border bg-card p-4 transition-all", done ? "border-primary/30 bg-primary-wash/40" : "border-hairline")}>
      <div className="flex items-start gap-3">
        <div className={cn("grid size-9 shrink-0 place-items-center rounded-btn", done ? "bg-primary text-white" : "bg-primary-tint text-primary-dark")}>
          <Icon name={done ? "check" : KIND_ICON[task.kind]} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className={cn("text-[14px] font-bold text-ink", done && "line-through opacity-60")}>{task.title}</h3>
            <Badge tone={task.impact === "reviews" ? "gold" : "primary"}>{task.impact}</Badge>
          </div>
          <p className="mt-1 text-[13px] text-sub">{task.rationale}</p>
          {!done ? (
            <div className="mt-2 rounded-btn border border-hairline bg-paper px-3 py-2 text-[13px] text-ink/80">
              {task.preview}
            </div>
          ) : null}
        </div>
      </div>
      {!done && status !== "snoozed" ? (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={approve} loading={pending} icon="check">Approve &amp; publish</Button>
          <Button size="sm" variant="ghost" onClick={snooze} disabled={pending}>Snooze</Button>
          <span className="ml-auto text-[12px] text-faint">~{task.effortMins} min</span>
        </div>
      ) : done ? (
        <div className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-primary">
          <Icon name="check-circle" size={16} /> Done this week
        </div>
      ) : (
        <div className="mt-3 text-[13px] text-faint">Snoozed to next week</div>
      )}
    </div>
  );
}
