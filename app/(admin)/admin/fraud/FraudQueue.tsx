"use client";

import { useState } from "react";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { useToast } from "@/components/ds/Toast";
import { formatRelative } from "@/lib/utils/format";
import type { FraudFlag } from "@/lib/data/types";
import { SeverityBadge } from "../../_components/Severity";

const KIND_LABEL: Record<FraudFlag["kind"], string> = {
  same_device: "Same device",
  staff_self_review: "Staff self-review",
  velocity_anomaly: "Velocity anomaly",
};

export function FraudQueue({ flags }: { flags: FraudFlag[] }) {
  const { toast } = useToast();
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});

  function act(f: FraudFlag) {
    setReviewed((r) => ({ ...r, [f.id]: true }));
    toast(`${KIND_LABEL[f.kind]} flag on ${f.tenant} actioned`, "success", "check-circle");
  }

  return (
    <div className="overflow-x-auto rounded-card border border-hairline bg-card shadow-sm">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline">
            {["Tenant", "Signal", "Detail", "Severity", "When", ""].map((h, i) => (
              <th key={h || i} className="px-3 py-2.5 kicker text-faint">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {flags.map((f) => {
            const done = reviewed[f.id];
            return (
              <tr key={f.id} className="border-b border-hairline last:border-0 hover:bg-primary-wash/40">
                <td className="px-3 py-3 text-[14px] font-semibold text-ink">{f.tenant}</td>
                <td className="px-3 py-3"><Badge tone="neutral">{KIND_LABEL[f.kind]}</Badge></td>
                <td className="px-3 py-3 text-[14px] text-sub">{f.detail}</td>
                <td className="px-3 py-3"><SeverityBadge sev={f.severity} /></td>
                <td className="px-3 py-3 text-[14px] text-sub">{formatRelative(f.at)}</td>
                <td className="px-3 py-3 text-right">
                  {done ? (
                    <Badge tone="primary" icon="check-circle">Actioned</Badge>
                  ) : (
                    <Button variant="secondary" size="sm" icon="shield" onClick={() => act(f)}>Review</Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
