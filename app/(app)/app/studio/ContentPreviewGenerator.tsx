"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import { generateContentSuggestionPreviewAction } from "@/lib/actions";

export function ContentPreviewGenerator({
  suggestionId,
  regenerate = false,
  disabled = false,
  includeImage = false,
}: {
  suggestionId: string;
  regenerate?: boolean;
  disabled?: boolean;
  includeImage?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  const generate = () => startTransition(async () => {
    const result = await generateContentSuggestionPreviewAction(suggestionId);
    if (result.ok) {
      toast(result.message, "success", "sparkles");
      router.refresh();
    } else {
      toast(result.message, "danger", "alert");
    }
  });

  return (
    <Button
      size="sm"
      variant={regenerate ? "secondary" : "primary"}
      icon={regenerate ? "refresh" : "sparkles"}
      loading={pending}
      disabled={disabled}
      onClick={generate}
    >
      {pending ? "Creating exact preview" : regenerate ? "Regenerate" : includeImage ? "Generate text & image" : "Generate exact draft"}
    </Button>
  );
}
