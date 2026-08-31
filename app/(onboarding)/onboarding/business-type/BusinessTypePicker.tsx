"use client";

import { useState, useTransition } from "react";
import { Chip } from "@/components/ds";
import { Icon, type IconName } from "@/components/icons";
import { updateIndustryAction } from "@/lib/actions";

const TYPES: { key: string; label: string; icon: IconName }[] = [
  { key: "restaurant", label: "Restaurant", icon: "flame" },
  { key: "cafe", label: "Café", icon: "gift" },
  { key: "bakery", label: "Bakery", icon: "star" },
  { key: "salon", label: "Salon", icon: "sparkles" },
  { key: "barber", label: "Barbershop", icon: "pencil" },
  { key: "spa", label: "Spa", icon: "leaf" },
  { key: "physiotherapy", label: "Physiotherapy", icon: "users" },
  { key: "dental", label: "Dental", icon: "shield" },
  { key: "medical_clinic", label: "Medical clinic", icon: "plus" },
  { key: "chiropractic", label: "Chiropractic", icon: "refresh" },
  { key: "general_contractor", label: "General contractor", icon: "building" },
  { key: "renovation", label: "Renovation", icon: "home" },
  { key: "plumbing", label: "Plumbing", icon: "filter" },
  { key: "electrician", label: "Electrician", icon: "settings" },
  { key: "hvac", label: "HVAC", icon: "trend" },
  { key: "auto_repair", label: "Auto repair", icon: "settings" },
  { key: "real_estate", label: "Real estate", icon: "map-pin" },
  { key: "law_firm", label: "Law firm", icon: "file" },
  { key: "accounting", label: "Accounting", icon: "chart" },
  { key: "gym", label: "Gym", icon: "trophy" },
  { key: "retail_store", label: "Retail store", icon: "credit-card" },
  { key: "professional_services", label: "Professional services", icon: "compass" },
];

/** "dog_grooming" -> "Dog Grooming" — for industries saved outside this list. */
function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function BusinessTypePicker({ initial }: { initial: string }) {
  const [selected, setSelected] = useState(initial);
  const [saving, startSaving] = useTransition();
  const current = TYPES.find((t) => t.key === selected);

  function pick(key: string) {
    setSelected(key);
    startSaving(async () => {
      await updateIndustryAction(key);
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-busy={saving}>
        {TYPES.map((t) => (
          <Chip
            key={t.key}
            selected={selected === t.key}
            onClick={() => pick(t.key)}
            icon={t.icon}
            className="w-full justify-start min-h-[44px]"
          >
            {t.label}
          </Chip>
        ))}
      </div>

      {/* Status reflects what is actually stored — nothing claims to be saved
          until an industry has genuinely been chosen. */}
      <div className="flex items-start gap-2 rounded-btn bg-primary-wash px-3 py-2.5 text-[12px] text-sub">
        <Icon
          name={saving ? "refresh" : selected ? "check-circle" : "sparkles"}
          size={15}
          className="mt-0.5 shrink-0 text-primary"
        />
        <span>
          {saving ? (
            "Saving your industry…"
          ) : selected ? (
            <>
              Saved. The attribute catalog for{" "}
              <span className="font-semibold text-ink">
                {current?.label ?? humanizeKey(selected)}
              </span>{" "}
              loads automatically — customers tag things like speed, results, and friendliness.
            </>
          ) : (
            "No industry chosen yet — pick one and your review prompts and attribute catalog load automatically."
          )}
        </span>
      </div>
    </div>
  );
}
