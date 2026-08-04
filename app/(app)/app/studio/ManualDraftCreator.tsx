"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import { createManualContentDraftAction } from "@/lib/actions";
import { MANUAL_CONTENT_KINDS, manualContentKindLabel, type ManualContentKind } from "@/lib/ai/content-studio";

const HELP: Record<ManualContentKind, string> = {
  local_post: "A Google post with an original AI image, ready to review before anything is published.",
  profile_copy: "A business description drafted from your confirmed category and city.",
};

export function ManualDraftCreator({ disabled = false }: { disabled?: boolean }) {
  const [kind, setKind] = useState<ManualContentKind>("local_post");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  const create = () => startTransition(async () => {
    const result = await createManualContentDraftAction(kind);
    if (result.ok) {
      toast(result.message, "success", "sparkles");
      router.refresh();
    } else {
      toast(result.message, "danger", "alert");
    }
  });

  return (
    <div className="rounded-card border border-hairline bg-paper p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[200px] flex-1">
          <span className="kicker text-faint">Start a draft yourself</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as ManualContentKind)}
            disabled={disabled || pending}
            className="mt-1 h-10 w-full rounded-btn border border-hairline bg-card px-3 text-[14px] text-ink disabled:opacity-60"
          >
            {MANUAL_CONTENT_KINDS.map((option) => (
              <option key={option} value={option}>{manualContentKindLabel(option)}</option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          variant="primary"
          icon="sparkles"
          loading={pending}
          disabled={disabled || pending}
          onClick={create}
        >
          {pending ? "Creating exact preview" : "Create draft"}
        </Button>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-sub">{HELP[kind]}</p>
      <p className="mt-1 text-[11px] text-faint">
        Grounded only in facts confirmed from Google Places. Owner replies and Q&amp;A answers need a
        connected Business Profile, because they must attach to a real review or question.
      </p>
    </div>
  );
}
