"use client";

import { Badge } from "@/components/ds/misc";
import { Table, type Column } from "@/components/ds/Table";
import { formatRelative } from "@/lib/utils/format";
import type { DeliveryIncident } from "@/lib/data/types";
import { SeverityBadge } from "../../_components/Severity";

/** Presentational — incidents arrive pre-sorted (severity, then count) from the server. */
export function DeliveryTable({ incidents }: { incidents: DeliveryIncident[] }) {
  const columns: Column<DeliveryIncident>[] = [
    {
      key: "tenant",
      header: "Tenant",
      render: (i) => <span className="text-[14px] font-semibold text-ink">{i.tenant}</span>,
    },
    {
      key: "channel",
      header: "Channel",
      render: (i) => <Badge tone="neutral">{i.channel.toUpperCase()}</Badge>,
    },
    {
      key: "type",
      header: "Type",
      render: (i) => <span className="text-[14px] text-sub">{i.type}</span>,
    },
    {
      key: "severity",
      header: "Severity",
      render: (i) => <SeverityBadge sev={i.severity} />,
    },
    {
      key: "count",
      header: "Count",
      numeric: true,
      render: (i) => <span className="font-bold text-ink">{i.count}</span>,
    },
    {
      key: "at",
      header: "When",
      align: "right",
      render: (i) => <span className="text-[13px] tabular-nums text-sub">{formatRelative(i.at)}</span>,
    },
  ];

  return (
    <Table
      columns={columns}
      data={incidents}
      rowKey={(i) => i.id}
      caption="Delivery failure incidents"
      emptyIcon="check-circle"
      emptyTitle="No active incidents"
      emptyDescription="Delivery monitoring is reporting, and no email or SMS incident is open across the tenants it covers."
    />
  );
}
