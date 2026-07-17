"use client";

import { useMemo, useState } from "react";
import { Table, type Column, type SortDirection } from "@/components/ds/Table";
import type { DurabilityRecord } from "@/lib/data/types";

type SortKey = "tenant" | "posted" | "survived30d" | "survived60d" | "vanished" | "filteredRate";

function sortValue(r: DurabilityRecord, key: SortKey): number | string {
  const v = r[key];
  return typeof v === "number" ? v : String(v).toLowerCase();
}

/** Raw per-tenant durability ledger. Defaults to the highest filtered rate first. */
export function DurabilityTable({ records }: { records: DurabilityRecord[] }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "filteredRate",
    direction: "desc",
  });

  const rows = useMemo(() => {
    return [...records].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [records, sort]);

  const columns: Column<DurabilityRecord>[] = [
    {
      key: "tenant",
      header: "Tenant",
      sortable: true,
      ariaLabel: "Sort by tenant",
      render: (r) => <span className="text-[14px] font-semibold text-ink">{r.tenant}</span>,
    },
    { key: "posted", header: "Posted", numeric: true, sortable: true, ariaLabel: "Sort by posted" },
    { key: "survived30d", header: "Survived 30d", numeric: true, sortable: true, ariaLabel: "Sort by survived 30d" },
    {
      key: "survived60d",
      header: "Survived 60d",
      numeric: true,
      sortable: true,
      ariaLabel: "Sort by survived 60d",
      render: (r) => <span className="font-bold text-primary">{r.survived60d}</span>,
    },
    {
      key: "vanished",
      header: "Vanished",
      numeric: true,
      sortable: true,
      ariaLabel: "Sort by vanished",
      render: (r) => <span className="font-bold text-danger">{r.vanished}</span>,
    },
    {
      key: "filteredRate",
      header: "Filtered",
      numeric: true,
      sortable: true,
      ariaLabel: "Sort by filtered rate",
      render: (r) => <span>{Math.round(r.filteredRate * 100)}%</span>,
    },
  ];

  return (
    <Table
      columns={columns}
      data={rows}
      rowKey={(r) => r.id}
      sort={sort}
      onSortChange={(key, direction) => setSort({ key: key as SortKey, direction })}
      caption="Per-tenant review durability"
    />
  );
}
