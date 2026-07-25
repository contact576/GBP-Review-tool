"use client";

import { Badge } from "@/components/ds/misc";
import { Table, type Column } from "@/components/ds/Table";
import { formatRelative } from "@/lib/utils/format";
import type { FraudFlag } from "@/lib/data/types";
import { SeverityBadge } from "../../_components/Severity";
import { HonestNote } from "../../_components/telemetry";

const KIND_LABEL: Record<FraudFlag["kind"], string> = {
  same_device: "Same device",
  staff_self_review: "Staff self-review",
  velocity_anomaly: "Velocity anomaly",
};

/**
 * Read-only queue.
 *
 * The old "Review" button only set local state and fired a success toast — it
 * marked flags as actioned without actioning anything, and the state vanished
 * on reload. The affordance is gone rather than faked: triage is not wired, so
 * the column says exactly that and nothing here mutates tenant data.
 */
export function FraudQueue({ flags }: { flags: FraudFlag[] }) {
  const columns: Column<FraudFlag>[] = [
    {
      key: "tenant",
      header: "Tenant",
      render: (f) => <span className="text-[14px] font-semibold text-ink">{f.tenant}</span>,
    },
    {
      key: "kind",
      header: "Signal",
      render: (f) => <Badge tone="neutral">{KIND_LABEL[f.kind]}</Badge>,
    },
    {
      key: "detail",
      header: "Detail",
      render: (f) => <span className="text-[14px] text-sub">{f.detail}</span>,
    },
    {
      key: "severity",
      header: "Severity",
      render: (f) => <SeverityBadge sev={f.severity} />,
    },
    {
      key: "at",
      header: "When",
      render: (f) => <span className="text-[13px] tabular-nums text-sub">{formatRelative(f.at)}</span>,
    },
    {
      key: "triage",
      header: "Triage",
      align: "right",
      render: () => (
        <span title="Triage actions are not wired in this deployment." className="inline-block">
          <Badge tone="sub" icon="lock">Not wired</Badge>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <Table
        columns={columns}
        data={flags}
        rowKey={(f) => f.id}
        caption="Fraud queue — suspicious capture signals (read-only)"
        emptyIcon="shield"
        emptyTitle="No flags in this queue"
        emptyDescription="No suspicious capture signals are recorded for the accounts this console can see."
      />

      <HonestNote>
        Triage is not wired: there is no action on this screen that resolves, dismisses, or escalates a flag, and nothing
        here changes tenant data. Flags must be actioned in the source system until the triage writer and its audit-log
        entry exist.
      </HonestNote>
    </div>
  );
}
