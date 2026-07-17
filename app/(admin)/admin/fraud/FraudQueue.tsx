"use client";

import { useState } from "react";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Table, type Column } from "@/components/ds/Table";
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
      key: "action",
      header: "",
      align: "right",
      render: (f) =>
        reviewed[f.id] ? (
          <Badge tone="primary" icon="check-circle">Actioned</Badge>
        ) : (
          <Button variant="secondary" size="sm" icon="shield" onClick={() => act(f)}>
            Review
          </Button>
        ),
    },
  ];

  return (
    <Table
      columns={columns}
      data={flags}
      rowKey={(f) => f.id}
      caption="Fraud queue — suspicious capture signals"
      emptyIcon="shield"
      emptyTitle="Queue clear"
      emptyDescription="No suspicious capture signals are awaiting triage."
    />
  );
}
