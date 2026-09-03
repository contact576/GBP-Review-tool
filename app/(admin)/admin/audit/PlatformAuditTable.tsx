"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ds/form";
import { Badge } from "@/components/ds/misc";
import { Table, type Column } from "@/components/ds/Table";
import { formatRelative } from "@/lib/utils/format";
import type { PlatformAuditEntry } from "@/lib/data/types";

/** Support actions get a distinct chip so an operator's footprint is easy to spot. */
function isSupport(action: string): boolean {
  return action.startsWith("support.") || action.startsWith("fraud.");
}

export function PlatformAuditTable({ entries }: { entries: PlatformAuditEntry[] }) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const sorted = [...entries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((e) =>
      [e.tenant, e.actor, e.action, e.targetType, e.targetId].some((v) => v.toLowerCase().includes(q)),
    );
  }, [entries, query]);

  const columns: Column<PlatformAuditEntry>[] = [
    {
      key: "tenant",
      header: "Tenant",
      render: (e) => (
        <Link
          href={`/admin/tenants/${encodeURIComponent(e.organizationId)}`}
          className="text-[14px] font-semibold text-ink hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {e.tenant}
        </Link>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      render: (e) => <span className="text-[13px] text-sub">{e.actor}</span>,
    },
    {
      key: "action",
      header: "Action",
      render: (e) => (
        <code
          className={
            isSupport(e.action)
              ? "rounded-chip bg-gold-tint px-1.5 py-0.5 text-[13px] font-semibold text-gold-deep"
              : "rounded-chip bg-primary-wash px-1.5 py-0.5 text-[13px] font-semibold text-primary-dark"
          }
        >
          {e.action}
        </code>
      ),
    },
    {
      key: "target",
      header: "Target",
      render: (e) => (
        <span className="text-[13px] text-sub">
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
          placeholder="Search tenant, actor, action or target…"
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
        caption="Append-only privileged-action audit log, all tenants"
        emptyIcon={entries.length === 0 ? "lock" : "search"}
        emptyTitle={entries.length === 0 ? "No privileged actions recorded yet" : "No matching entries"}
        emptyDescription={
          entries.length === 0
            ? "The ledgers are genuinely empty — this reads every tenant's audit table, and no privileged action has been written to any of them yet."
            : `Nothing in the audit log matches “${query}”. Try a different tenant, actor, action, or target.`
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="sub" icon="lock">Append-only · immutable</Badge>
        <Badge tone="gold">support.* · operator actions</Badge>
        <span className="text-[12px] tabular-nums text-faint">{rows.length} of {entries.length} entries</span>
      </div>
    </div>
  );
}
