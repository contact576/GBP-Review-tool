"use client";

import { useState } from "react";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";

/** Narrative block with AI regenerate + printable share. */
export function ReportActions({
  initialNarrative,
  business,
  foundYou,
  foundDelta,
  contactedYou,
  newReviews,
}: {
  initialNarrative: string;
  business: string;
  foundYou: number;
  foundDelta: number;
  contactedYou: number;
  newReviews: number;
}) {
  const { toast } = useToast();
  const [narrative, setNarrative] = useState(initialNarrative);
  const [loading, setLoading] = useState(false);

  async function regenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/report-narration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ business, foundYou, foundDelta, contactedYou, newReviews }),
      });
      const data = await res.json();
      if (data?.text) {
        setNarrative(data.text);
        toast("Narrative refreshed", "success", "sparkles");
      } else {
        toast("Couldn't refresh the narrative", "warning", "alert");
      }
    } catch {
      toast("Couldn't reach the AI service", "warning", "alert");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="text-[14px] leading-relaxed text-ink/90">{narrative}</p>
      <div className="mt-4 flex flex-wrap gap-2 print:hidden">
        <Button variant="secondary" size="sm" icon="refresh" onClick={regenerate} loading={loading}>
          Regenerate narrative
        </Button>
        <Button variant="ghost" size="sm" icon="download" onClick={() => window.print()}>
          Download / Share
        </Button>
      </div>
    </div>
  );
}
