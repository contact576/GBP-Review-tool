"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import { markNotificationsReadAction } from "@/lib/actions";

export function MarkAllRead({ unreadCount }: { unreadCount: number }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  function markAll() {
    start(async () => {
      await markNotificationsReadAction();
      toast("All notifications marked read", "success", "check-circle");
      router.refresh();
    });
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      icon="check"
      onClick={markAll}
      loading={pending}
      disabled={unreadCount === 0}
    >
      Mark all read
    </Button>
  );
}
