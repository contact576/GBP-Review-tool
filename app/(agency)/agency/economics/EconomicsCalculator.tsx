"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ds/Card";
import { Field, Input } from "@/components/ds/form";
import { StatTile } from "@/components/charts/StatTile";

function money(sym: string, n: number): string {
  return `${sym}${Math.round(n).toLocaleString("en")}`;
}

function clampNum(v: string, min = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? n : min;
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
          <StatTile label="Monthly revenue" value={money(currencySymbol, monthlyRevenue)} deltaCaption={`${nLoc} × ${money(currencySymbol, nRetail)}`} />
          <StatTile label="Wholesale cost" value={money(currencySymbol, monthlyCost)} deltaCaption={`${nLoc} × ${money(currencySymbol, nWhole)}`} />
        </div>
        {/* Deep-green hero — the single dark anchor for the earned margin */}
        <div className="rounded-card bg-hero p-4 shadow-lg sm:p-5">
          <StatTile
            onHero
            boxless
            label="Monthly margin"
            value={money(currencySymbol, monthlyMargin)}
            deltaCaption={`${marginPct}% margin across ${nLoc} locations`}
          />
        </div>
        <StatTile label="Annual margin" value={money(currencySymbol, annualMargin)} deltaCaption="Monthly margin × 12" />
      </div>
    </div>
  );
}
