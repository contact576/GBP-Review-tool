"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Input } from "@/components/ds/form";
import { Table, type Column, type SortDirection } from "@/components/ds/Table";
import { Icon } from "@/components/icons";
import { formatMoney } from "@/lib/utils/format";
import type { PlatformTenant } from "@/lib/data/types";
import { TenantStatusBadge } from "../../_components/TenantStatus";

type SortKey = "name" | "vertical" | "plan" | "mrr" | "locations" | "region";

/**
 * Impersonation is a permanently-disabled placeholder, not a feature that is
 * merely "loading". The reason and the audit promise are stated in the UI —
 * a greyed-out button with no explanation is not an honest gate.
 */
const IMPERSONATION_REASON =
  "Support impersonation is not enabled in this deployment. It requires the database-backed support role and the audit writer, neither of which is wired here.";

export function ImpersonationNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-card border border-dashed border-hairline bg-card p-4">
      <Icon name="lock" size={18} className="mt-px shrink-0 text-faint" aria-hidden />
      <div className="text-[13px] leading-relaxed text-sub">
        <p className="text-[14px] font-semibold text-ink">Impersonation is not enabled</p>
        <p className="mt-1">
          {IMPERSONATION_REASON} The per-row <span className="font-semibold text-ink">Impersonate</span> control is a
          disabled placeholder and does nothing. When it is enabled, every session opens read-only and is written to the
          append-only audit log with the operator, the tenant, and the reason — before the session starts, not after.
        </p>
      </div>
    </div>
  );
}

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
      header: (
        <span className="inline-flex items-center gap-1.5">
          Impersonate
          <Badge tone="sub" icon="lock" className="font-sans normal-case tracking-normal">
            Not enabled
          </Badge>
        </span>
      ),
      ariaLabel: "Impersonate — not enabled",
      align: "right",
      render: (t) => (
        // Permanently gated placeholder. The wrapper carries the tooltip because
        // a disabled button has no pointer events, and the aria-label spells the
        // whole state out for assistive tech.
        <span title={IMPERSONATION_REASON} className="inline-block">
          <Button
            variant="secondary"
            size="sm"
            icon="lock"
            disabled
            aria-disabled="true"
            aria-label={`Impersonate ${t.name} — not enabled. ${IMPERSONATION_REASON} When enabled, the session is audit-logged.`}
          >
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

      <p className="text-[12px] tabular-nums text-faint">
        {rows.length} of {tenants.length} tenants shown · impersonation is disabled in this deployment and audit-logged
        when enabled.
      </p>
    </div>
  );
}
