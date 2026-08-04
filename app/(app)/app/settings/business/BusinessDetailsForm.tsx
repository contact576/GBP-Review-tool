"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import { updateBusinessDetailsAction } from "@/lib/actions";

export function BusinessDetailsForm({
  website,
  ownerDescription,
  googleWebsite,
}: {
  website: string;
  ownerDescription: string;
  /** Google's value, when a Business Profile sync has supplied one. */
  googleWebsite?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const submit = (formData: FormData) => startTransition(async () => {
    const result = await updateBusinessDetailsAction(formData);
    toast(result.message, result.ok ? "success" : "danger", result.ok ? "check-circle" : "alert");
    if (result.ok) {
      setDirty(false);
      router.refresh();
    }
  });

  return (
    <form action={submit} onChange={() => setDirty(true)} className="space-y-4">
      <label className="block">
        <span className="text-[13px] font-bold text-ink">Website</span>
        <input
          name="website"
          type="text"
          inputMode="url"
          defaultValue={website}
          placeholder="example.com"
          disabled={pending}
          className="mt-1 h-10 w-full rounded-btn border border-hairline bg-card px-3 text-[14px] text-ink disabled:opacity-60"
        />
        <span className="mt-1 block text-[12px] text-sub">
          {googleWebsite
            ? `Google currently reports ${googleWebsite}. That value stays authoritative on your profile.`
            : "Used to read your site as evidence and to allow link buttons on generated posts. https:// is added if you leave it off."}
        </span>
      </label>

      <label className="block">
        <span className="text-[13px] font-bold text-ink">Business description</span>
        <textarea
          name="ownerDescription"
          rows={4}
          maxLength={750}
          defaultValue={ownerDescription}
          placeholder="What you do, who you serve, and where."
          disabled={pending}
          className="mt-1 w-full rounded-btn border border-hairline bg-card px-3 py-2 text-[14px] leading-relaxed text-ink disabled:opacity-60"
        />
        <span className="mt-1 block text-[12px] text-sub">
          Up to 750 characters. Saved in Foundly only — nothing is written to Google without a separate approval.
        </span>
      </label>

      <Button type="submit" size="sm" variant="primary" icon="check" loading={pending} disabled={pending || !dirty}>
        {pending ? "Saving" : "Save details"}
      </Button>
    </form>
  );
}
