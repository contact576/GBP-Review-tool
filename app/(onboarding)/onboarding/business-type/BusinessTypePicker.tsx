"use client";

import { useState } from "react";
import { Chip } from "@/components/ds";
import { Icon, type IconName } from "@/components/icons";

const TYPES: { key: string; label: string; icon: IconName }[] = [
  { key: "physiotherapy", label: "Physiotherapy", icon: "leaf" },
  { key: "chiropractic", label: "Chiropractic", icon: "users" },
  { key: "dental", label: "Dental", icon: "star" },
  { key: "hvac", label: "HVAC", icon: "settings" },
  { key: "renovation", label: "Renovation", icon: "building" },
  { key: "salon", label: "Salon", icon: "sparkles" },
  { key: "restaurant", label: "Restaurant", icon: "gift" },
];

export function BusinessTypePicker() {
  const [selected, setSelected] = useState("physiotherapy");
  const current = TYPES.find((t) => t.key === selected);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        {TYPES.map((t) => (
          <Chip
            key={t.key}
            selected={selected === t.key}
            onClick={() => setSelected(t.key)}
            icon={t.icon}
            className="w-full justify-start"
          >
            {t.label}
          </Chip>
        ))}
      </div>

      <div className="flex items-start gap-2 rounded-btn bg-primary-wash px-3 py-2.5 text-[12px] text-sub">
        <Icon name="sparkles" size={15} className="mt-0.5 shrink-0 text-primary" />
        <span>
          Attribute catalog for{" "}
          <span className="font-semibold text-ink">{current?.label ?? "your vertical"}</span>{" "}
          loaded automatically — customers will tag things like wait time, results, and friendliness.
        </span>
      </div>
    </div>
  );
}
