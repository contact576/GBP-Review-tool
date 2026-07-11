"use client";

import { useState } from "react";
import { Card } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { Toggle } from "@/components/ds/form";
import { useToast } from "@/components/ds/Toast";
import type { FeatureFlag } from "@/lib/data/types";

const ROLLOUT: Record<FeatureFlag["rollout"], { tone: "primary" | "gold" | "sub"; label: string }> = {
  all: { tone: "primary", label: "GA · all tenants" },
  beta: { tone: "gold", label: "Beta" },
  internal: { tone: "sub", label: "Internal only" },
};

export function FlagsTable({ flags }: { flags: FeatureFlag[] }) {
  const { toast } = useToast();
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(flags.map((f) => [f.key, f.enabled])),
  );

  function flip(f: FeatureFlag, next: boolean) {
    setState((s) => ({ ...s, [f.key]: next }));
    toast(`${f.key} ${next ? "enabled" : "disabled"}`, next ? "success" : "info", next ? "check-circle" : "flag");
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
                <Toggle checked={on} onChange={(v) => flip(f, v)} label={`Toggle ${f.key}`} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
