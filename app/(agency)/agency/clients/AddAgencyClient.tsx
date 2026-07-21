"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAgencyClientAction } from "@/lib/actions";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Field, Input, Select } from "@/components/ds/form";
import type { Region } from "@/lib/data/types";

export function AddAgencyClient({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [industryKey, setIndustryKey] = useState("professional_services");
  const [region, setRegion] = useState<Region>("US");
  const [city, setCity] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createAgencyClientAction({
        businessName,
        contactEmail,
        industryKey,
        category: industryKey.replace(/_/g, " "),
        region,
        city,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBusinessName("");
      setContactEmail("");
      setCity("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button icon="plus" onClick={() => setOpen(true)} disabled={!enabled}>
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
            <p className="mt-1 text-[13px] text-sub">Each client gets separate data, integrations, and reporting.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <Field label="Business name" required>
            <Input value={businessName} onChange={(event) => setBusinessName(event.target.value)} required maxLength={120} />
          </Field>
          <Field label="Report email" required>
            <Input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} required maxLength={254} />
          </Field>
          <Field label="Industry">
            <Select value={industryKey} onChange={(event) => setIndustryKey(event.target.value)}>
              <option value="professional_services">Professional services</option>
              <option value="dental">Dental</option>
              <option value="medical_clinic">Medical clinic</option>
              <option value="restaurant">Restaurant</option>
              <option value="home_services">Home services</option>
              <option value="auto_repair">Auto repair</option>
            </Select>
          </Field>
          <Field label="Region">
            <Select value={region} onChange={(event) => setRegion(event.target.value as Region)}>
              <option value="US">United States</option>
              <option value="CA">Canada</option>
            </Select>
          </Field>
          <Field label="City">
            <Input value={city} onChange={(event) => setCity(event.target.value)} maxLength={100} />
          </Field>
        </div>
        {error ? <p role="alert" className="text-[13px] font-medium text-danger">{error}</p> : null}
        <div className="flex justify-end">
          <Button type="submit" loading={pending} icon="plus">Create client workspace</Button>
        </div>
      </form>
    </Card>
  );
}
