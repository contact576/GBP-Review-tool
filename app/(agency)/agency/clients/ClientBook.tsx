"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { Input } from "@/components/ds/form";
import { Table, type Column, type SortDirection } from "@/components/ds/Table";
import { Sparkline } from "@/components/charts/Sparkline";
import { formatRelative } from "@/lib/utils/format";
import type { AgencyClient } from "@/lib/data/types";
import { StatusBadge, statusRank } from "../../_components/StatusBadge";

type SortKey =
  | "name"
  | "city"
  | "growthScore"
  | "rating"
  | "newReviews30d"
  | "needsReply"
  | "status"
  | "lastReportSent";

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

/** Band the growth score to a token colour — the number carries the meaning, the ring is a supplement. */
function scoreBand(score: number): string {
  if (score >= 75) return "text-primary";
  if (score >= 50) return "text-gold-deep";
  return "text-danger";
}

export function ClientBook({ clients, plans }: { clients: AgencyClient[]; plans: Record<string, string> }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "status",
    direction: "asc",
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = clients.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q),
    );
    const sorted = [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sort.direction === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [clients, query, sort]);

  const columns: Column<AgencyClient>[] = [
    {
      key: "name",
      header: "Client",
      sortable: true,
      ariaLabel: "Sort by client",
      render: (c) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <Link
              href={`/agency/clients/${c.locationId}`}
              onClick={(e) => e.stopPropagation()}
              className="truncate text-[14px] font-semibold text-ink hover:underline focus-visible:outline-none focus-visible:underline"
            >
              {c.name}
            </Link>
            <span className="hidden sm:block">
              <Sparkline data={trail(c.growthScore)} width={56} height={20} />
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-faint">{plans[c.plan] ?? c.plan}</div>
        </div>
      ),
    },
    {
      key: "city",
      header: "City",
      sortable: true,
      ariaLabel: "Sort by city",
      render: (c) => <span className="text-[13px] text-sub">{c.city}</span>,
    },
    {
      key: "growthScore",
      header: "Growth",
      numeric: true,
      sortable: true,
      ariaLabel: "Sort by growth score",
      render: (c) => <span className={cn("font-bold", scoreBand(c.growthScore))}>{c.growthScore}</span>,
    },
    {
      key: "rating",
      header: "Rating",
      numeric: true,
      sortable: true,
      ariaLabel: "Sort by rating",
      render: (c) => (
        <span className="inline-flex items-center justify-end gap-1 text-ink">
          <Icon name="star-fill" size={12} className="text-faint" aria-hidden />
          {c.rating.toFixed(1)}
        </span>
      ),
    },
    {
      key: "newReviews30d",
      header: "New · 30d",
      numeric: true,
      sortable: true,
      ariaLabel: "Sort by new reviews",
    },
    {
      key: "needsReply",
      header: "Needs reply",
      numeric: true,
      sortable: true,
      ariaLabel: "Sort by needs reply",
      render: (c) => (
        <span className={cn(c.needsReply > 4 ? "font-semibold text-danger" : "text-sub")}>{c.needsReply}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      ariaLabel: "Sort by status",
      render: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: "lastReportSent",
      header: "Last report",
      align: "right",
      sortable: true,
      ariaLabel: "Sort by last report",
      render: (c) => (
        <span className="text-[12px] tabular-nums text-sub">
          {c.lastReportSent ? formatRelative(c.lastReportSent) : "—"}
        </span>
      ),
    },
  ];

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

      <Table
        columns={columns}
        data={rows}
        rowKey={(c) => c.locationId}
        onRowClick={(c) => router.push(`/agency/clients/${c.locationId}`)}
        sort={sort}
        onSortChange={(key, direction) => setSort({ key: key as SortKey, direction })}
        stickyHeader
        caption="Client book — every location under management"
        emptyIcon="search"
        emptyTitle="No matching clients"
        emptyDescription={`No clients match “${query}”. Try a different name or city.`}
      />

      <p className="text-[12px] text-faint">
        {rows.length} of {clients.length} clients · tap a column to sort · rows open the client panel.
      </p>
    </div>
  );
}
