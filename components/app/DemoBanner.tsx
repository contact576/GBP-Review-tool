"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { resetDemoAction, signOutAction } from "@/lib/actions";

/**
 * Slim, non-dismissible strip shown on every authed surface while a demo
 * session is active — the honest boundary between sample and real data.
 */
export function DemoBanner() {
  const router = useRouter();
  const [resetting, startReset] = useTransition();
  const [exiting, startExit] = useTransition();

  function resetDemo() {
    startReset(async () => {
      await resetDemoAction();
      router.refresh();
    });
  }

  function exitDemo() {
    startExit(async () => {
      await signOutAction();
    });
  }

  return (
    <div
      data-testid="demo-banner"
      role="status"
      className="flex min-h-[40px] w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-gold/30 bg-gold-tint px-4 py-1.5 text-[13px] text-gold-deep"
    >
      <span className="flex items-center gap-2 font-medium">
        <Icon name="eye" size={15} className="shrink-0" />
        <span>
          Demo mode — you&rsquo;re browsing Harbourview Physiotherapy, a sample business with
          sample data.
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={resetDemo}
          disabled={resetting || exiting}
          className="font-semibold underline underline-offset-2 transition-opacity hover:opacity-75 disabled:opacity-50"
        >
          {resetting ? "Resetting…" : "Reset demo data"}
        </button>
        <button
          type="button"
          onClick={exitDemo}
          disabled={resetting || exiting}
          className="font-semibold underline underline-offset-2 transition-opacity hover:opacity-75 disabled:opacity-50"
        >
          {exiting ? "Exiting…" : "Exit demo"}
        </button>
      </span>
    </div>
  );
}
