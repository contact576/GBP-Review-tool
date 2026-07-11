"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";

/** Mock: turns an un-named AEO query into a Co-Pilot task, then routes there. */
export function GapToTask({ query }: { query: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  function onClick() {
    setBusy(true);
    toast("Added to This Week — we'll draft the fix", "success", "sparkles");
    setTimeout(() => router.push("/app/this-week"), 700);
  }

  return (
    <Button variant="secondary" size="sm" icon="plus" onClick={onClick} loading={busy}>
      Turn gap into a task
    </Button>
  );
}
