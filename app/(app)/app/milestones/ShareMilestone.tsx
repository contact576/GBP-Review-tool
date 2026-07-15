"use client";

import { MilestoneCard } from "@/components/app/MilestoneCard";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import type { Milestone } from "@/lib/data/types";

/** A milestone card with a real share action: Web Share API, else clipboard. */
export function ShareMilestone({ milestone }: { milestone: Milestone }) {
  const { toast } = useToast();

  async function share() {
    const text = `${milestone.title} — ${milestone.subtitle}`;
    const url = window.location.origin;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: milestone.title, text, url });
      } catch {
        // User dismissed the share sheet — nothing to report.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast("Copied share text", "success", "copy");
    } catch {
      toast("Couldn't copy — select and copy the milestone text", "warning", "alert");
    }
  }

  return (
    <div>
      <MilestoneCard milestone={milestone} />
      <div className="mt-2 flex justify-end">
        <Button variant="secondary" size="sm" icon="external" onClick={share}>
          {milestone.shared ? "Share again" : "Share"}
        </Button>
      </div>
    </div>
  );
}
