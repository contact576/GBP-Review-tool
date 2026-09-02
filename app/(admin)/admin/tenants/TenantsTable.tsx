"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ds/Button";
import { openTenantWorkspaceAction } from "@/lib/actions";
import { Badge } from "@/components/ds/misc";
import { Input } from "@/components/ds/form";
import { Table, type Column, type SortDirection } from "@/components/ds/Table";
import { Icon } from "@/components/icons";
import { formatMoney } from "@/lib/utils/format";
import type { PlatformTenant } from "@/lib/data/types";
import { TenantStatusBadge } from "../../_components/TenantStatus";

type SortKey = "name" | "vertical" | "plan" | "mrr" | "locations" | "region";

/**
 * Opening a tenant is a real support session, not read-only. Say exactly what
 * it is and where it is recorded, before the button — not after.
 */
export function ImpersonationNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-card border border-hairline bg-primary-wash p-4">
      <Icon name="shield" size={18} className="mt-px shrink-0 text-primary" aria-hidden />
      <div className="text-[13px] leading-relaxed text-sub">
        <p className="text-[14px] font-semibold text-ink">Open a tenant as Foundly support</p>
        <p className="mt-1">
          <span className="font-semibold text-ink">Open tenant</span> enters that account&rsquo;s owner console with
          full owner access — every button works, and every change is theirs. The session is written to the
          tenant&rsquo;s own audit log (operator, time) before it starts. A banner on every page names the tenant and
          the way back.
        </p>
      </div>
    </div>
  );
}

function sortValue(t: PlatformTenant, key: SortKey): number | string {
  const v = t[key];
  return typeof v === "number" ? v : String(v).toLowerCase();
}

function OpenTenantButton({ tenant, enabled }: { tenant: PlatformTenant; enabled: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const target = tenant.primaryWorkspaceId;
  if (!target) {
    return (
      <span title="This row is a seeded fixture with no workspace behind it." className="inline-block">
        <Button variant="secondary" size="sm" icon="lock" disabled aria-disabled="true">
          Open tenant
        </Button>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        icon="external"
        loading={pending}
        disabled={!enabled}
        aria-label={`Open ${tenant.name} as Foundly support`}
        onClick={() =>
          start(async () => {
            const result = await openTenantWorkspaceAction(target);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        Open tenant
      </Button>
      {error ? <span role="status" className="text-[11px] text-danger">{error}</span> : null}
    </span>
  );
}

export function TenantsTable({ tenants, canOpen = true }: { tenants: PlatformTenant[]; canOpen?: boolean }) {
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
            (t.ownerEmail ?? "").toLowerCase().includes(q) ||
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
      render: (t) => (
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-ink">{t.name}</div>
          {t.ownerEmail ? <div className="truncate text-[12px] text-faint">{t.ownerEmail}</div> : null}
        </div>
      ),
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
      header: "Support",
      ariaLabel: "Open tenant as Foundly support",
      align: "right",
      render: (t) => <OpenTenantButton tenant={t} enabled={canOpen} />,
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
