"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ds/form";
import { Badge, EmptyState } from "@/components/ds/misc";
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

      <div className="overflow-x-auto rounded-card border border-hairline bg-card shadow-sm">
        <table className="w-full min-w-[680px] border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline">
              {["Actor", "Action", "Target", "When"].map((h) => (
                <th key={h} className="px-3 py-2.5 kicker text-faint">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-hairline last:border-0 hover:bg-primary-wash/40">
                <td className="px-3 py-3 text-[14px] font-semibold text-ink">{e.actor}</td>
                <td className="px-3 py-3">
                  <code className="rounded-chip bg-primary-wash px-1.5 py-0.5 text-[14px] font-semibold text-primary-dark">{e.action}</code>
                </td>
                <td className="px-3 py-3 text-[14px] text-sub">
                  <span className="capitalize">{e.targetType}</span> <span className="text-faint">· {e.targetId}</span>
                </td>
                <td className="px-3 py-3 text-[14px] text-sub">{formatRelative(e.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <EmptyState
            icon="search"
            title="No matching entries"
            description={`Nothing in the audit log matches “${query}”. Try a different actor, action, or target.`}
          />
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Badge tone="sub" icon="lock">Append-only · immutable</Badge>
        <span className="text-[12px] text-faint">{rows.length} of {entries.length} entries</span>
      </div>
    </div>
  );
}
