"use client";

import { useState } from "react";
import { Toggle } from "@/components/ds/form";
import { useToast } from "@/components/ds/Toast";

interface ConsentSetting {
  key: string;
  title: string;
  hint: string;
  value: boolean;
  locked?: boolean;
}

/** Dual-consent configuration toggles (demo — local state + toast). */
export function ConsentConfig({ isCanada }: { isCanada: boolean }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ConsentSetting[]>([
    {
      key: "service",
      title: "Require service consent before any request",
      hint: "Customers must agree to messages about their visit. Always on — it's the legal basis for review requests.",
      value: true,
      locked: true,
    },
    {
      key: "marketing",
      title: "Ask for a separate marketing opt-in",
      hint: "A second, optional checkbox for offers and campaigns. Never bundled with service consent.",
      value: true,
    },
    {
      key: "casl",
      title: "Capture CASL express consent (Canada)",
      hint: "Records express consent at point of service, as CASL requires.",
      value: isCanada,
      locked: isCanada,
    },
    {
      key: "doubleOptIn",
      title: "Double opt-in for imported contacts",
      hint: "Imported lists get a confirmation email before they can be messaged.",
      value: false,
    },
  ]);

  function set(key: string, value: boolean) {
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)));
    toast("Consent setting saved", "success", "shield");
  }

  return (
    <div className="divide-y divide-hairline">
      {settings.map((s) => (
        <div key={s.key} className="flex items-start justify-between gap-4 py-3.5">
          <div>
            <div className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              {s.title}
              {s.locked ? <span className="text-[11px] font-medium text-faint">(required)</span> : null}
            </div>
            <p className="mt-0.5 text-[12px] text-sub">{s.hint}</p>
          </div>
          <Toggle
            checked={s.value}
            onChange={(v) => set(s.key, v)}
            disabled={s.locked}
            label={s.title}
          />
        </div>
      ))}
    </div>
  );
}
