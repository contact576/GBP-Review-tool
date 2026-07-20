"use client";

import { useState, useTransition } from "react";
import { approveContentSuggestionAction, approveProfileSuggestionAction } from "@/lib/actions";
import type { ProfileSuggestion, ProfileSuggestionStatus } from "@/lib/data/types";
import { Button } from "@/components/ds/Button";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ds/Toast";
import { suggestionStatusLabel } from "@/lib/suggestions/inbox";

export function ProfileSuggestionApproval({
  suggestion,
  isDemo,
}: {
  suggestion: ProfileSuggestion;
  isDemo: boolean;
}) {
  const [status, setStatus] = useState<ProfileSuggestionStatus>(suggestion.status);
  const [factsConfirmed, setFactsConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const needsFacts = suggestion.risk === "high";
  const contentPublishing = ["local_post", "owner_reply", "qna"].includes(suggestion.kind);

  const approve = () => startTransition(async () => {
    const result = contentPublishing
      ? await approveContentSuggestionAction(suggestion.id)
      : await approveProfileSuggestionAction(suggestion.id, factsConfirmed);
    if (result.ok) {
      setStatus(result.status);
      toast(result.message, result.status === "applied" ? "success" : "info", result.status === "applied" ? "check-circle" : "clock");
    } else {
      if (result.status) setStatus(result.status);
      toast(result.message, "danger", "alert");
    }
  });

  if (status !== "ready_for_review") {
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-btn border border-hairline bg-paper px-3 py-2 text-[12px] font-semibold text-sub">
        <Icon name={status === "applied" ? "check-circle" : status === "failed" ? "alert" : "clock"} size={15} />
        {suggestionStatusLabel(status)}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {needsFacts ? (
        <label className="flex cursor-pointer items-start gap-2 rounded-btn border border-gold/30 bg-gold-tint/35 px-3 py-2.5 text-[12px] leading-relaxed text-sub">
          <input
            type="checkbox"
            checked={factsConfirmed}
            onChange={(event) => setFactsConfirmed(event.target.checked)}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>I confirm this exact value is a genuine current business fact and is consistent with the real-world business.</span>
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={approve}
          loading={pending}
          disabled={isDemo || (!contentPublishing && needsFacts && !factsConfirmed)}
          icon="check"
        >
          {contentPublishing ? "Approve & publish to Google" : "Approve & apply to Google"}
        </Button>
        <span className="text-[11px] font-medium text-faint">
          {isDemo ? "Live publishing is disabled in the sample workspace." : "One idempotent approval; Google is read back after writing."}
        </span>
      </div>
    </div>
  );
}
