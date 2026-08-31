"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ds/Card";
import { Badge, EmptyState } from "@/components/ds/misc";
import { Toggle } from "@/components/ds/form";
import { useToast } from "@/components/ds/Toast";
import { setFeatureFlagAction } from "@/lib/actions";
import type { FeatureFlag } from "@/lib/data/types";

// `rollout` is a label stored on the flag record, not an enforced audience —
// nothing in this deployment fans a toggle out to other tenants. The copy says
// "tagged" so the chip cannot be read as a claim about who is receiving it.
const ROLLOUT: Record<FeatureFlag["rollout"], { tone: "primary" | "gold" | "sub"; label: string }> = {
  all: { tone: "primary", label: "Tagged GA" },
  beta: { tone: "gold", label: "Tagged beta" },
  internal: { tone: "sub", label: "Tagged internal" },
};

export function FlagsTable({ flags }: { flags: FeatureFlag[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(flags.map((f) => [f.key, f.enabled])),
  );

  function flip(f: FeatureFlag, next: boolean) {
    // Optimistic: flip locally right away, then persist.
    setState((s) => ({ ...s, [f.key]: next }));
    start(async () => {
      try {
        await setFeatureFlagAction(f.key, next);
        toast(`${f.key} ${next ? "enabled" : "disabled"}`, next ? "success" : "info", next ? "check-circle" : "flag");
        router.refresh();
      } catch {
        // Roll back the optimistic flip if the write failed.
        setState((s) => ({ ...s, [f.key]: !next }));
        toast(`Couldn't update ${f.key}`, "danger", "alert");
      }
    });
  }

  if (flags.length === 0) {
    // Genuinely zero, not unmeasured: this reads the workspace's own record.
    return (
      <Card padded={false}>
        <EmptyState
          icon="flag"
          title="No feature flags on this workspace"
          description="The workspace record carries no flag entries, so there is nothing to toggle. Flags appear here once they are seeded onto the record."
        />
      </Card>
    );
  }

  return (
    <Card padded={false}>
      <ul className="divide-y divide-hairline">
        {flags.map((f) => {
          const on = state[f.key] ?? f.enabled;
          const r = ROLLOUT[f.rollout];
          return (
            <li key={f.key} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-chip bg-primary-wash px-1.5 py-0.5 text-[12px] font-semibold text-primary-dark">{f.key}</code>
                  <Badge tone={r.tone}>{r.label}</Badge>
                </div>
                <p className="mt-1 text-[13px] text-sub">{f.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`text-[12px] font-semibold ${on ? "text-primary" : "text-faint"}`}>{on ? "On" : "Off"}</span>
                <Toggle checked={on} onChange={(v) => flip(f, v)} disabled={pending} label={`Toggle ${f.key}`} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
