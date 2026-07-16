"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { EmptyState } from "@/components/ds/misc";
import { Input } from "@/components/ds/form";
import { Sparkline } from "@/components/charts/Sparkline";
import { formatRelative } from "@/lib/utils/format";
import type { AgencyClient } from "@/lib/data/types";
import { StatusBadge, statusRank } from "../../_components/StatusBadge";

type SortKey = "name" | "city" | "growthScore" | "rating" | "newReviews30d" | "needsReply" | "status" | "lastReportSent";

const COLUMNS: { key: SortKey; label: string; align?: "left" | "right"; numeric?: boolean }[] = [
  { key: "name", label: "Client" },
  { key: "city", label: "City" },
  { key: "growthScore", label: "Growth", numeric: true, align: "right" },
  { key: "rating", label: "Rating", numeric: true, align: "right" },
  { key: "newReviews30d", label: "New · 30d", numeric: true, align: "right" },
  { key: "needsReply", label: "Needs reply", numeric: true, align: "right" },
  { key: "status", label: "Status" },
  { key: "lastReportSent", label: "Last report", align: "right" },
];

function sortValue(c: AgencyClient, key: SortKey): number | string {
  if (key === "status") return statusRank[c.status];
  if (key === "lastReportSent") return c.lastReportSent ? new Date(c.lastReportSent).getTime() : 0;
  const v = c[key];
  return typeof v === "number" ? v : String(v).toLowerCase();
}

/** Tiny illustrative growth trail derived from the score (no per-client series in the model). */
function trail(score: number): number[] {
  return [score - 9, score - 6, score - 7, score - 3, score - 1, score];
}

export function ClientBook({ clients, plans }: { clients: AgencyClient[]; plans: Record<string, string> }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("status");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = clients.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q),
    );
    const sorted = [...filtered].sort((a, b) => {
      const av = sortValue(a, sort);
      const bv = sortValue(b, sort);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [clients, query, sort, dir]);

  function toggleSort(key: SortKey) {
    if (key === sort) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setDir(key === "name" || key === "city" ? "asc" : "desc");
    }
  }

  return (
    <div className="space-y-3">
      <div className="max-w-sm">
        <Input
          iconLeft="search"
          placeholder="Search by client or city…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search clients"
        />
      </div>

      <div className="overflow-x-auto rounded-card border border-hairline bg-card shadow-sm">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline">
              {COLUMNS.map((col) => {
                const active = sort === col.key;
                return (
                  <th key={col.key} className={cn("px-3 py-2.5", col.align === "right" && "text-right")}>
                    <button
                      onClick={() => toggleSort(col.key)}
                      className={cn(
                        "inline-flex items-center gap-1 kicker transition-colors hover:text-ink",
                        col.align === "right" && "flex-row-reverse",
                        active ? "text-ink" : "text-faint",
                      )}
                    >
                      {col.label}
                      {active ? <Icon name={dir === "asc" ? "arrow-up" : "arrow-down"} size={12} /> : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.locationId} className="group border-b border-hairline last:border-0 hover:bg-primary-wash/40">
                <td className="px-3 py-3">
                  <Link href={`/agency/clients/${c.locationId}`} className="flex items-center gap-2.5">
                    <span className="text-[14px] font-semibold text-ink group-hover:underline">{c.name}</span>
                    <span className="hidden sm:block"><Sparkline data={trail(c.growthScore)} width={56} height={20} /></span>
                  </Link>
                  <div className="mt-0.5 text-[11px] text-faint">{plans[c.plan] ?? c.plan}</div>
                </td>
                <td className="px-3 py-3 text-[13px] text-sub">{c.city}</td>
                <td className="px-3 py-3 text-right data-chip text-[13px] font-bold text-ink">{c.growthScore}</td>
                <td className="px-3 py-3 text-right data-chip text-[13px] text-ink">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <Icon name="star-fill" size={12} className="text-star" />
                    {c.rating.toFixed(1)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right data-chip text-[13px] text-ink">{c.newReviews30d}</td>
                <td className="px-3 py-3 text-right">
                  <span className={cn("data-chip text-[13px] font-semibold", c.needsReply > 4 ? "text-danger" : "text-sub")}>
                    {c.needsReply}
                  </span>
                </td>
                <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                <td className="px-3 py-3 text-right text-[12px] text-sub">
                  {c.lastReportSent ? formatRelative(c.lastReportSent) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <EmptyState
            icon="search"
            title="No matching clients"
            description={`No clients match “${query}”. Try a different name or city.`}
          />
        ) : null}
      </div>
      <p className="text-[12px] text-faint">{rows.length} of {clients.length} clients · tap a column to sort · rows open the client panel.</p>
    </div>
  );
}
