"use client";

import { useMemo, useState } from "react";
import { Table, type Column, type SortDirection } from "@/components/ds/Table";
import { formatMoney } from "@/lib/utils/format";
import type { PlatformTenant } from "@/lib/data/types";
import { TenantStatusBadge } from "../../_components/TenantStatus";

type SortKey = "name" | "plan" | "mrr";

function sortValue(t: PlatformTenant, key: SortKey): number | string {
  const v = t[key];
  return typeof v === "number" ? v : String(v).toLowerCase();
}

export function SubscriptionsTable({ tenants }: { tenants: PlatformTenant[] }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "mrr",
    direction: "desc",
  });

  const rows = useMemo(() => {
    return [...tenants].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [tenants, sort]);

  const columns: Column<PlatformTenant>[] = [
    {
      key: "name",
      header: "Tenant",
      sortable: true,
      ariaLabel: "Sort by tenant",
      render: (t) => <span className="text-[14px] font-semibold text-ink">{t.name}</span>,
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
      key: "status",
      header: "Status",
      render: (t) => <TenantStatusBadge status={t.status} />,
    },
  ];

  return (
    <Table
      columns={columns}
      data={rows}
      rowKey={(t) => t.id}
      sort={sort}
      onSortChange={(key, direction) => setSort({ key: key as SortKey, direction })}
      caption="Subscriptions by tenant"
    />
  );
}
