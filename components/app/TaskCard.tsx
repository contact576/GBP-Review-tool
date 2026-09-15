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
        "tile-row flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap",
        done && "border-primary/25 bg-primary-wash/70",
      )}
    >
      <span
        className={cn(
          "icon-plate icon-plate-sm",
          done && "bg-primary text-white",
        )}
      >
        <Icon name={done ? "check" : KIND_ICON[task.kind]} size={15} />
      </span>

      <div className="min-w-0 flex-1">
        <h3 className={cn("truncate text-[13px] font-semibold text-ink", done && "text-sub line-through")}>
          {task.title}
        </h3>
        <p className="mt-1 flex min-w-0 items-center gap-2 text-[12px] leading-none text-sub">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gold-tint px-2 py-1 text-[11px] font-bold text-gold-deep">
            <span className="flex items-end gap-0.5" aria-hidden="true">
              <span className="h-1.5 w-0.5 rounded-sm bg-current" />
              <span className="h-2 w-0.5 rounded-sm bg-current" />
              <span className="h-2.5 w-0.5 rounded-sm bg-current" />
            </span>
            {impact}
          </span>
          <span className="hidden min-w-0 truncate text-[13px] leading-none text-sub md:inline">{task.rationale}</span>
        </p>
      </div>

      <button
        type="button"
        onClick={approve}
        disabled={pending || done}
        className={cn(
          "inline-flex h-7 w-full min-w-[72px] shrink-0 items-center justify-center rounded-md px-2.5 text-[12px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary sm:w-auto",
          done
            ? "bg-primary-wash text-primary"
            : "bg-primary text-white hover:bg-primary-dark disabled:opacity-60",
        )}
      >
        {pending ? "Saving…" : done ? "Done" : "Approve"}
      </button>
    </div>
  );
}
