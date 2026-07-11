"use client";

import { MilestoneCard } from "@/components/app/MilestoneCard";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import type { Milestone } from "@/lib/data/types";

/** A milestone card with a mock share action. */
export function ShareMilestone({ milestone }: { milestone: Milestone }) {
  const { toast } = useToast();

  function share() {
    toast(`Share card for "${milestone.title}" ready to post`, "success", "sparkles");
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
