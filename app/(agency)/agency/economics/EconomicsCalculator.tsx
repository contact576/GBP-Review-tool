"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ds/Card";
import { Field, Input } from "@/components/ds/form";
import { Icon, type IconName } from "@/components/icons";

function money(sym: string, n: number): string {
  return `${sym}${Math.round(n).toLocaleString("en")}`;
}

function clampNum(v: string, min = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? n : min;
}

function Result({ icon, label, value, sub, hero }: { icon: IconName; label: string; value: string; sub?: string; hero?: boolean }) {
  return (
    <div className={hero ? "rounded-card bg-hero p-4 text-white shadow-lg" : "rounded-card border border-hairline bg-card p-4 shadow-sm"}>
      <div className={`flex items-center gap-1.5 ${hero ? "text-white/80" : "text-sub"}`}>
        <Icon name={icon} size={15} />
        <span className="text-[12px] font-medium">{label}</span>
      </div>
      <div className={`mt-1.5 text-[28px] font-extrabold leading-none tabular-nums ${hero ? "text-white" : "text-ink"}`}>{value}</div>
      {sub ? <div className={`mt-1 text-[12px] ${hero ? "text-white/70" : "text-faint"}`}>{sub}</div> : null}
    </div>
  );
}

export function EconomicsCalculator({
  currencySymbol, defaults,
}: {
  currencySymbol: string;
  defaults: { locations: number; wholesale: number; retail: number };
}) {
  const [locations, setLocations] = useState(String(defaults.locations));
  const [wholesale, setWholesale] = useState(String(defaults.wholesale));
  const [retail, setRetail] = useState(String(defaults.retail));

  const nLoc = clampNum(locations);
  const nWhole = clampNum(wholesale);
  const nRetail = clampNum(retail);

  const perUnitMargin = nRetail - nWhole;
  const monthlyRevenue = nLoc * nRetail;
  const monthlyCost = nLoc * nWhole;
  const monthlyMargin = nLoc * perUnitMargin;
  const annualMargin = monthlyMargin * 12;
  const marginPct = nRetail > 0 ? Math.round((perUnitMargin / nRetail) * 100) : 0;
  const underwater = perUnitMargin < 0;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader kicker="Inputs" title="Wholesale economics" />
        <div className="space-y-4">
          <Field label="Locations" hint="How many client locations you resell to.">
            <Input type="number" min={0} inputMode="numeric" value={locations} onChange={(e) => setLocations(e.target.value)} />
          </Field>
          <Field label={`Wholesale rate (${currencySymbol} / location / mo)`} hint="What you pay Foundly per location.">
            <Input type="number" min={0} inputMode="decimal" value={wholesale} onChange={(e) => setWholesale(e.target.value)} />
          </Field>
          <Field
            label={`Retail price (${currencySymbol} / location / mo)`}
            hint={underwater ? undefined : "What you charge the client."}
            error={underwater ? "Retail is below wholesale — you'd lose money per location." : undefined}
          >
            <Input type="number" min={0} inputMode="decimal" value={retail} onChange={(e) => setRetail(e.target.value)} invalid={underwater} />
          </Field>
        </div>
        <div className="mt-4 rounded-btn bg-primary-wash p-3 text-[12px] text-sub">
          Per location you keep <span className="font-semibold text-ink">{money(currencySymbol, perUnitMargin)}</span> of{" "}
          <span className="font-semibold text-ink">{money(currencySymbol, nRetail)}</span> — a{" "}
          <span className="font-semibold text-ink">{marginPct}%</span> margin.
        </div>
      </Card>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Result icon="credit-card" label="Monthly revenue" value={money(currencySymbol, monthlyRevenue)} sub={`${nLoc} × ${money(currencySymbol, nRetail)}`} />
          <Result icon="arrow-down" label="Wholesale cost" value={money(currencySymbol, monthlyCost)} sub={`${nLoc} × ${money(currencySymbol, nWhole)}`} />
        </div>
        <Result icon="trend" label="Monthly margin" value={money(currencySymbol, monthlyMargin)} sub={`${marginPct}% margin across ${nLoc} locations`} hero />
        <Result icon="chart" label="Annual margin" value={money(currencySymbol, annualMargin)} sub="Monthly margin × 12" />
      </div>
    </div>
  );
}
