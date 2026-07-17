"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ds/form";
import { Badge } from "@/components/ds/misc";
import { Table, type Column } from "@/components/ds/Table";
import { formatRelative } from "@/lib/utils/format";
import type { AuditLog } from "@/lib/data/types";

export function AuditTable({ entries }: { entries: AuditLog[] }) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const sorted = [...entries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((e) =>
      [e.actor, e.action, e.targetType, e.targetId].some((v) => v.toLowerCase().includes(q)),
    );
  }, [entries, query]);

  const columns: Column<AuditLog>[] = [
    {
      key: "actor",
      header: "Actor",
      render: (e) => <span className="text-[14px] font-semibold text-ink">{e.actor}</span>,
    },
    {
      key: "action",
      header: "Action",
      render: (e) => (
        <code className="rounded-chip bg-primary-wash px-1.5 py-0.5 text-[13px] font-semibold text-primary-dark">
          {e.action}
        </code>
      ),
    },
    {
      key: "target",
      header: "Target",
      render: (e) => (
        <span className="text-[14px] text-sub">
          <span className="capitalize">{e.targetType}</span> <span className="text-faint">· {e.targetId}</span>
        </span>
      ),
    },
    {
      key: "at",
      header: "When",
      align: "right",
      render: (e) => <span className="text-[13px] tabular-nums text-sub">{formatRelative(e.at)}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="max-w-sm">
        <Input
          iconLeft="search"
          placeholder="Search actor, action or target…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search audit log"
        />
      </div>

      <Table
        columns={columns}
        data={rows}
        rowKey={(e) => e.id}
        stickyHeader
        caption="Append-only privileged-action audit log"
        emptyIcon="search"
        emptyTitle="No matching entries"
        emptyDescription={`Nothing in the audit log matches “${query}”. Try a different actor, action, or target.`}
      />

      <div className="flex items-center gap-2">
        <Badge tone="sub" icon="lock">Append-only · immutable</Badge>
        <span className="text-[12px] text-faint">{rows.length} of {entries.length} entries</span>
      </div>
    </div>
  );
}
