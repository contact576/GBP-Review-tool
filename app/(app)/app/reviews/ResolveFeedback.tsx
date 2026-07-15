"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import { resolveFeedbackAction } from "@/lib/actions";

export function ResolveFeedback({ id }: { id: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  function resolve() {
    start(async () => {
      await resolveFeedbackAction(id);
      toast("Feedback marked resolved", "success", "check-circle");
      router.refresh();
    });
  }

  return (
    <Button variant="secondary" size="sm" icon="check" onClick={resolve} loading={pending}>
      Mark resolved
    </Button>
  );
}
