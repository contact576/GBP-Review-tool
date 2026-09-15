"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAgencyClientAction } from "@/lib/actions";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Field, Input, Select } from "@/components/ds/form";
import { Icon } from "@/components/icons";
import type { Region } from "@/lib/data/types";

export interface IndustryOption {
  key: string;
  label: string;
}
export interface IndustryGroupOption {
  label: string;
  industries: IndustryOption[];
}

export function AddAgencyClient({
  enabled,
  groups,
  defaultRegion,
  agencyEmail,
}: {
  enabled: boolean;
  /** The full industry catalogue, grouped — the same one onboarding uses. */
  groups: IndustryGroupOption[];
  defaultRegion: Region;
  /** The agency's own address, so the form can warn when it is entered as the client's. */
  agencyEmail?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [industryKey, setIndustryKey] = useState(groups[0]?.industries[0]?.key ?? "professional_services");
  const [region, setRegion] = useState<Region>(defaultRegion);
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");

  const label = groups.flatMap((group) => group.industries).find((industry) => industry.key === industryKey)?.label ?? industryKey.replace(/_/g, " ");
  const isOwnEmail = Boolean(agencyEmail) && contactEmail.trim().toLowerCase() === agencyEmail?.toLowerCase();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createAgencyClientAction({
        businessName,
        contactEmail,
        industryKey,
        category: label,
        region,
        city,
        address,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(
        result.google
          ? `${businessName} added and matched to its Google listing: ${result.google.name}, ${result.google.city} — ${result.google.rating.toFixed(1)}★ from ${result.google.reviewCount} reviews.`
          : `${businessName} added. No confident Google match was found — open the client and link its listing.`,
      );
      setBusinessName("");
      setContactEmail("");
      setCity("");
      setAddress("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-3">
        {notice ? <p role="status" className="text-[13px] font-medium text-sub">{notice}</p> : null}
        <Button icon="plus" onClick={() => { setNotice(null); setOpen(true); }} disabled={!enabled}>
          Add client
        </Button>
      </div>
    );
  }

  return (
    <Card raised>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="kicker mb-1">New client workspace</div>
            <h2 className="text-[18px] font-bold text-ink">Add an isolated client</h2>
            <p className="mt-1 text-[13px] text-sub">
              Each client gets separate data, integrations, and reporting. We look for its Google listing as soon as it is created.
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Business name" required>
            <Input value={businessName} onChange={(event) => setBusinessName(event.target.value)} required maxLength={120} placeholder="Townhill Constructions" />
          </Field>
          <Field
            label="Client contact email"
            required
            hint={isOwnEmail ? undefined : "Receives the branded report and, later, their own login invite."}
            error={isOwnEmail ? "That is your own address. Use the client's — it receives their reports and login invite." : undefined}
          >
            <Input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} required maxLength={254} invalid={isOwnEmail} placeholder="owner@client.com" />
          </Field>
          <Field label="Industry">
            <Select value={industryKey} onChange={(event) => setIndustryKey(event.target.value)}>
              {groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.industries.map((industry) => (
                    <option key={industry.key} value={industry.key}>{industry.label}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label="Region">
            <Select value={region} onChange={(event) => setRegion(event.target.value as Region)}>
              <option value="US">United States</option>
              <option value="CA">Canada</option>
            </Select>
          </Field>
          <Field label="City" hint="Helps match the right Google listing.">
            <Input value={city} onChange={(event) => setCity(event.target.value)} maxLength={100} placeholder="Brampton" />
          </Field>
          <Field label="Street address (optional)">
            <Input value={address} onChange={(event) => setAddress(event.target.value)} maxLength={180} />
          </Field>
        </div>
        {error ? <p role="alert" className="text-[13px] font-medium text-danger">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-start gap-1.5 text-[12px] text-faint">
            <Icon name="google" size={13} className="mt-px shrink-0" />
            A match is linked only when the listing name plausibly matches; otherwise the client is created unlinked and you pick the listing yourself.
          </p>
          <Button type="submit" loading={pending} icon="plus" disabled={isOwnEmail}>Create client workspace</Button>
        </div>
      </form>
    </Card>
  );
}
