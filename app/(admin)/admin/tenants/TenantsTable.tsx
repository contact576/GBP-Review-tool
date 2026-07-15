"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ds/form";
import { formatMoney } from "@/lib/utils/format";
import type { PlatformTenant } from "@/lib/data/types";
import { TenantStatusBadge } from "../../_components/TenantStatus";

export function TenantsTable({ tenants }: { tenants: PlatformTenant[] }) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(
      (t) => t.name.toLowerCase().includes(q) || t.vertical.toLowerCase().includes(q) || t.region.toLowerCase().includes(q),
    );
  }, [tenants, query]);

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

      <div className="overflow-x-auto rounded-card border border-hairline bg-card shadow-sm">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline">
              {["Tenant", "Vertical", "Plan", "MRR", "Locations", "Status", "Region", ""].map((h, i) => (
                <th key={h || i} className={`px-3 py-2.5 kicker text-faint ${["MRR", "Locations"].includes(h) ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-hairline last:border-0 hover:bg-primary-wash/40">
                <td className="px-3 py-3 text-[14px] font-semibold text-ink">{t.name}</td>
                <td className="px-3 py-3 text-[13px] capitalize text-sub">{t.vertical}</td>
                <td className="px-3 py-3 text-[13px] capitalize text-sub">{t.plan}</td>
                <td className="px-3 py-3 text-right data-chip text-[13px] font-bold text-ink">{formatMoney(t.mrr)}</td>
                <td className="px-3 py-3 text-right data-chip text-[13px] text-ink">{t.locations}</td>
                <td className="px-3 py-3"><TenantStatusBadge status={t.status} /></td>
                <td className="px-3 py-3 text-[13px] text-sub">{t.region}</td>
                <td className="px-3 py-3 text-right">
                  <span title="Available with database + support audit trail" className="inline-block">
                    <Button variant="secondary" size="sm" icon="lock" disabled>
                      Impersonate
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-faint">No tenants match “{query}”.</div>
        ) : null}
      </div>
      <p className="text-[12px] text-faint">
        {rows.length} of {tenants.length} tenants · impersonation unlocks with the database and a support audit trail.
      </p>
    </div>
  );
}
