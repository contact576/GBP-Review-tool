"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { initDbAction, testAiAction, testPlacesAction } from "./actions";

/** One-click database initialization — runs the idempotent schema DDL. */
export function InitDbButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await initDbAction();
            setResult(res.ok ? "Database initialized" : res.error ?? "Failed");
            if (res.ok) router.refresh();
          })
        }
      >
        Initialize database
      </Button>
      {result ? <span className="text-[12px] text-sub">{result}</span> : null}
    </div>
  );
}

export function TestAiButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await testAiAction();
            setResult(res.ok ? "AI responded ✓" : res.error ?? "Test failed");
          })
        }
      >
        Test AI
      </Button>
      {result ? <span className="text-[12px] text-sub">{result}</span> : null}
    </div>
  );
}

export function TestPlacesButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await testPlacesAction();
            setResult(res.ok ? `Found: ${res.detail}` : res.error ?? "Test failed");
          })
        }
      >
        Test lookup
      </Button>
      {result ? <span className="text-[12px] text-sub">{result}</span> : null}
    </div>
  );
}
