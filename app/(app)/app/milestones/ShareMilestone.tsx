"use client";

import { useState } from "react";
import { MilestoneCard } from "@/components/app/MilestoneCard";
import { MilestoneShareCard } from "@/components/app/MilestoneShareCard";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import type { Milestone } from "@/lib/data/types";

/**
 * An achieved milestone tile with two share affordances:
 *  - "Share image" reveals an on-brand, downloadable celebration graphic.
 *  - "Share text" uses the Web Share API, falling back to the clipboard.
 */
export function ShareMilestone({
  milestone,
  business,
  rating,
  reviewCount,
}: {
  milestone: Milestone;
  business: string;
  rating?: number;
  reviewCount?: number;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

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
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" icon="external" onClick={share}>
          Share text
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon="sparkles"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {open ? "Hide image" : milestone.shared ? "Share image again" : "Share image"}
        </Button>
      </div>

      {open ? (
        <div className="mt-3 animate-slide-up">
          <MilestoneShareCard
            milestone={milestone}
            business={business}
            rating={rating}
            reviewCount={reviewCount}
          />
        </div>
      ) : null}
    </div>
  );
}
