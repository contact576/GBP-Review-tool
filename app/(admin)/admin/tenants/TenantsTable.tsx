"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ds/form";
import { Table, type Column, type SortDirection } from "@/components/ds/Table";
import { formatMoney } from "@/lib/utils/format";
import type { PlatformTenant } from "@/lib/data/types";
import { TenantStatusBadge } from "../../_components/TenantStatus";

type SortKey = "name" | "vertical" | "plan" | "mrr" | "locations" | "region";

function sortValue(t: PlatformTenant, key: SortKey): number | string {
  const v = t[key];
  return typeof v === "number" ? v : String(v).toLowerCase();
}

export function TenantsTable({ tenants }: { tenants: PlatformTenant[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "mrr",
    direction: "desc",
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? tenants.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.vertical.toLowerCase().includes(q) ||
            t.region.toLowerCase().includes(q),
        )
      : tenants;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [tenants, query, sort]);

  const columns: Column<PlatformTenant>[] = [
    {
      key: "name",
      header: "Tenant",
      sortable: true,
      ariaLabel: "Sort by tenant",
      render: (t) => <span className="text-[14px] font-semibold text-ink">{t.name}</span>,
    },
    {
      key: "vertical",
      header: "Vertical",
      sortable: true,
      ariaLabel: "Sort by vertical",
      render: (t) => <span className="text-[14px] capitalize text-sub">{t.vertical}</span>,
    },
    {
      key: "plan",
      header: "Plan",
      sortable: true,
      ariaLabel: "Sort by plan",
      render: (t) => <span className="text-[14px] capitalize text-sub">{t.plan}</span>,
    },
    {
      key: "mrr",
      header: "MRR",
      numeric: true,
      sortable: true,
      ariaLabel: "Sort by MRR",
      render: (t) => <span className="font-bold text-ink">{formatMoney(t.mrr)}</span>,
    },
    {
      key: "locations",
      header: "Locations",
      numeric: true,
      sortable: true,
      ariaLabel: "Sort by locations",
    },
    {
      key: "status",
      header: "Status",
      render: (t) => <TenantStatusBadge status={t.status} />,
    },
    {
      key: "region",
      header: "Region",
      sortable: true,
      ariaLabel: "Sort by region",
      render: (t) => <span className="text-[14px] text-sub">{t.region}</span>,
    },
    {
      key: "impersonate",
      header: "",
      align: "right",
      render: () => (
        // Impersonation stays gated — it unlocks only with the database + a
        // support audit trail. The disabled control keeps that promise visible.
        <span title="Available with database + support audit trail" className="inline-block">
          <Button variant="secondary" size="sm" icon="lock" disabled>
            Impersonate
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="max-w-sm">
        <Input
          iconLeft="search"
          placeholder="Search tenant, vertical or region…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search tenants"
        />
      </div>

      <Table
        columns={columns}
        data={rows}
        rowKey={(t) => t.id}
        sort={sort}
        onSortChange={(key, direction) => setSort({ key: key as SortKey, direction })}
        stickyHeader
        caption="Platform tenants"
        emptyIcon="search"
        emptyTitle="No tenants found"
        emptyDescription={`No tenants match “${query}”. Try a different name, vertical, or region.`}
      />

      <p className="text-[12px] text-faint">
        {rows.length} of {tenants.length} tenants · impersonation unlocks with the database and a support audit trail.
      </p>
    </div>
  );
}
