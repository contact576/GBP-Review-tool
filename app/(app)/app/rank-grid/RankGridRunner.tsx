"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runRankGridAction } from "@/lib/actions";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Field, Input, Select } from "@/components/ds/form";
import { Icon } from "@/components/icons";

export function RankGridRunner({
  scansUsed,
  scanLimit,
  connected,
}: {
  scansUsed: number;
  scanLimit: number;
  connected: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [keyword, setKeyword] = useState("best local business near me");
  const [gridSize, setGridSize] = useState("3");
  const [radiusKm, setRadiusKm] = useState("3");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function run(event: React.FormEvent) {
    event.preventDefault();
    setResult(null);
    startTransition(async () => {
      const response = await runRankGridAction({
        keyword,
        gridSize: Number(gridSize),
        radiusKm: Number(radiusKm),
      });
      setResult(response);
      if (response.ok) router.refresh();
    });
  }

  return (
    <Card raised>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="kicker mb-1.5">New visibility scan</div>
          <h2 className="text-[18px] font-bold text-ink">Measure local search coverage</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-sub">
            Each grid cell sends one Google Places Text Search request from that coordinate. Results
            are relevance-ranked Google Places visibility signals, not a scraped Google Maps local pack.
          </p>
        </div>
        <div className="data-chip text-faint">{scansUsed} of {scanLimit} scans used this month</div>
      </div>
      <form onSubmit={run} className="mt-5 grid gap-3 md:grid-cols-[minmax(240px,1fr)_150px_150px_auto] md:items-end">
        <Field label="Search keyword">
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            maxLength={80}
            placeholder="physiotherapy near me"
            required
          />
        </Field>
        <Field label="Grid">
          <Select value={gridSize} onChange={(event) => setGridSize(event.target.value)}>
            <option value="3">3 × 3 · 9 checks</option>
            <option value="5">5 × 5 · 25 checks</option>
          </Select>
        </Field>
        <Field label="Radius">
          <Select value={radiusKm} onChange={(event) => setRadiusKm(event.target.value)}>
            <option value="1">1 km</option>
            <option value="3">3 km</option>
            <option value="5">5 km</option>
            <option value="10">10 km</option>
          </Select>
        </Field>
        <Button type="submit" icon="search" loading={pending} disabled={!connected || scansUsed >= scanLimit}>
          Run scan
        </Button>
      </form>
      {!connected ? (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-gold-deep">
          <Icon name="alert" size={15} /> Select your Google business in onboarding first.
        </p>
      ) : null}
      {result ? (
        <p
          role="status"
          className={`mt-3 rounded-btn border px-3 py-2 text-[13px] font-medium ${
            result.ok
              ? "border-primary/25 bg-primary-wash text-primary-dark"
              : "border-danger/25 bg-danger-tint text-danger"
          }`}
        >
          {result.message}
        </p>
      ) : null}
    </Card>
  );
}
