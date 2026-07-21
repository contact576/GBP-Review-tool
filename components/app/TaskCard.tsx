"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";
import { useToast } from "@/components/ds/Toast";
import { approveTaskAction } from "@/lib/actions";
import type { GbpTask } from "@/lib/data/types";

const KIND_ICON: Record<GbpTask["kind"], IconName> = {
  post: "megaphone",
  photo: "camera",
  qna: "chat",
  service: "leaf",
  hours: "clock",
  reply: "send",
};

export function TaskCard({ task }: { task: GbpTask }) {
  const [status, setStatus] = useState(task.status);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const done = status === "done";
  const impact = task.kind === "qna" || task.kind === "service" ? "Medium impact" : "High impact";

  const approve = () =>
    start(async () => {
      await approveTaskAction(task.id);
      setStatus("done");
      toast("Marked complete — no Google changes were published", "success", "check-circle");
    });

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[10px] border px-3 py-2.5 transition-all sm:px-3.5",
        done ? "border-primary/25 bg-primary-wash/70" : "border-hairline bg-card hover:border-primary/20 hover:shadow-sm",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full",
          done ? "bg-primary text-white" : "bg-primary-wash text-primary-dark",
        )}
      >
        <Icon name={done ? "check" : KIND_ICON[task.kind]} size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <h3 className={cn("truncate text-[13px] font-bold text-ink sm:text-[14px]", done && "text-sub line-through")}>
          {task.title}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-[11px] leading-relaxed text-sub sm:text-[12px]">{task.rationale}</p>
      </div>

      <div className="hidden min-w-[94px] items-center gap-1.5 text-[10px] font-bold text-sub sm:flex">
        <span className="flex items-end gap-0.5 text-gold" aria-hidden="true">
          <span className="h-1.5 w-1 rounded-sm bg-current" />
          <span className="h-2.5 w-1 rounded-sm bg-current" />
          <span className="h-3.5 w-1 rounded-sm bg-current" />
        </span>
        {impact}
      </div>

      <button
        type="button"
        onClick={approve}
        disabled={pending || done}
        className={cn(
          "inline-flex h-8 min-w-[72px] shrink-0 items-center justify-center rounded-[8px] px-3 text-[11px] font-bold transition-colors focus-visible:ring-2 focus-visible:ring-primary",
          done
            ? "bg-primary-wash text-primary"
            : "bg-primary-dark text-white hover:bg-primary disabled:opacity-60",
        )}
      >
        {pending ? "Saving…" : done ? "Done" : "Approve"}
      </button>
    </div>
  );
}
