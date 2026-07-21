"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Field, Input } from "@/components/ds/form";
import { useToast } from "@/components/ds/Toast";
import { createOrganizationWorkspaceAction } from "@/lib/actions";
import type { OrganizationWorkspaceSummary } from "@/lib/data/provider";
import type { Region } from "@/lib/data/types";

export function LocationsManager({
  locations,
  currentWorkspaceId,
  industries,
  limit,
}: {
  locations: OrganizationWorkspaceSummary[];
  currentWorkspaceId: string;
  industries: Array<{ key: string; label: string }>;
  limit: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState(industries[0]?.key ?? "professional_services");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [region, setRegion] = useState<Region>("US");
  const atLimit = locations.length >= limit;

  function createLocation() {
    if (!name.trim()) return;
    const selected = industries.find((item) => item.key === industry);
    startTransition(async () => {
      const result = await createOrganizationWorkspaceAction({
        businessName: name,
        industryKey: industry,
        category: selected?.label ?? industry,
        region,
        city,
        address,
      });
      if (!result.ok) {
        toast(result.error, "warning", "alert");
        return;
      }
      setName("");
      setCity("");
      setAddress("");
      toast("Location added to your organization", "success", "check-circle");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {locations.map((location) => (
          <div key={location.workspaceId} className="rounded-card border border-hairline bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[15px] font-bold text-ink">{location.name}</div>
                <div className="mt-0.5 text-[12px] text-sub">{location.city || "City not set"}</div>
              </div>
              {location.workspaceId === currentWorkspaceId ? <Badge tone="primary">Active</Badge> : null}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-hairline pt-3 text-center">
              <Metric label="Score" value={location.growthScore ?? "-"} />
              <Metric label="Rating" value={location.rating ? location.rating.toFixed(1) : "-"} />
              <Metric label="Reviews" value={location.reviewCount} />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-card border border-hairline bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[17px] font-bold text-ink">Add a location</h2>
            <p className="mt-0.5 text-[13px] text-sub">Each location gets isolated customers, reviews, QR codes, Google data, and staff.</p>
          </div>
          <Badge tone={atLimit ? "gold" : "neutral"}>{locations.length} / {limit}</Badge>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" required><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Industry">
            <select value={industry} onChange={(event) => setIndustry(event.target.value)} className="h-11 w-full rounded-input border border-hairline bg-card px-3.5 text-[15px] text-ink">
              {industries.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Street address"><Input value={address} onChange={(event) => setAddress(event.target.value)} /></Field>
          <Field label="City"><Input value={city} onChange={(event) => setCity(event.target.value)} /></Field>
          <Field label="Region">
            <select value={region} onChange={(event) => setRegion(event.target.value as Region)} className="h-11 w-full rounded-input border border-hairline bg-card px-3.5 text-[15px] text-ink">
              <option value="US">United States</option><option value="CA">Canada</option>
            </select>
          </Field>
        </div>
        <Button className="mt-4" icon="plus" loading={pending} disabled={atLimit || !name.trim()} onClick={createLocation}>
          {atLimit ? "Location limit reached" : "Add location"}
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><div className="text-[17px] font-extrabold tabular-nums text-ink">{value}</div><div className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</div></div>;
}
