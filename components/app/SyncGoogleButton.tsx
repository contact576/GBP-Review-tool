"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { syncGoogleAction, type GoogleSyncActionResult } from "@/lib/actions";

/**
 * Owner-triggered "Sync from Google". Pulls real public data now (Places) and
 * attempts the full Business Profile import (no-ops honestly until Google
 * approves the project). Shows the plain-English result inline.
 */
export function SyncGoogleButton({
  label = "Sync from Google",
  variant = "primary",
  size = "sm",
}: {
  label?: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<GoogleSyncActionResult | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        size={size}
        variant={variant}
        icon="refresh"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await syncGoogleAction();
            setResult(res);
            if (res.ok) router.refresh();
          })
        }
      >
        {pending ? "Syncing…" : label}
      </Button>
      {result ? (
        <p className={`text-[13px] ${result.ok ? "text-sub" : "text-danger"}`}>{result.message}</p>
      ) : null}
    </div>
  );
}
