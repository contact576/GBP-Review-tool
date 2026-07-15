"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import { createTaskAction } from "@/lib/actions";

/** Turns an un-named AEO query into a real Co-Pilot task, then routes there. */
export function GapToTask({ query }: { query: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  function onClick() {
    start(async () => {
      await createTaskAction({
        kind: "service",
        title: `Add "${query}" to your services`,
        rationale: `AI assistants don't name you for "${query}" — a described service on your profile closes that gap.`,
        preview: `New service: ${query}. Add a short description so search and AI answers can match you to this question.`,
        impact: "profile",
      });
      toast("Added to This Week", "success", "sparkles");
      router.push("/app/this-week");
    });
  }

  return (
    <Button variant="secondary" size="sm" icon="plus" onClick={onClick} loading={pending}>
      Turn gap into a task
    </Button>
  );
}
