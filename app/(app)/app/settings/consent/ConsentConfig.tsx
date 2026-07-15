"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Toggle } from "@/components/ds/form";
import { useToast } from "@/components/ds/Toast";
import { updateWorkspaceSettingsAction } from "@/lib/actions";
import type { WorkspaceSettings } from "@/lib/data/types";

type SettingKey = keyof Pick<
  WorkspaceSettings,
  "serviceConsentDefault" | "marketingOptInVisible" | "quietHours"
>;

const ROWS: { key: SettingKey; title: string; hint: string }[] = [
  {
    key: "serviceConsentDefault",
    title: "Pre-select service consent at capture",
    hint: "Staff capture starts with the service-consent box checked — customers can still uncheck it.",
  },
  {
    key: "marketingOptInVisible",
    title: "Show the marketing opt-in checkbox",
    hint: "A second, optional checkbox for offers and campaigns. Never bundled with service consent.",
  },
  {
    key: "quietHours",
    title: "Quiet hours",
    hint: "Hold review requests overnight and deliver them at a reasonable local hour.",
  },
];

/** Consent configuration — each toggle persists to workspace settings. */
export function ConsentConfig({
  settings,
  isCanada,
}: {
  settings: WorkspaceSettings;
  isCanada: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [, start] = useTransition();
  const [values, setValues] = useState<WorkspaceSettings>(settings);

  function set(key: SettingKey, value: boolean) {
    setValues((prev) => ({ ...prev, [key]: value }));
    start(async () => {
      await updateWorkspaceSettingsAction({ [key]: value });
      toast("Consent setting saved", "success", "shield");
      router.refresh();
    });
  }

  return (
    <div className="divide-y divide-hairline">
      {/* Platform stance — always on, not configurable */}
      <div className="flex items-start justify-between gap-4 py-3.5">
        <div>
          <div className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            Require service consent before any request
            <span className="text-[11px] font-medium text-faint">(required)</span>
          </div>
          <p className="mt-0.5 text-[13px] text-sub">
            Customers must agree to messages about their visit. Always on — it&apos;s the legal
            basis for review requests.
          </p>
        </div>
        <Toggle checked disabled onChange={() => {}} label="Require service consent (always on)" />
      </div>

      {ROWS.map((row) => (
        <div key={row.key} className="flex items-start justify-between gap-4 py-3.5">
          <div>
            <div className="text-[15px] font-semibold text-ink">{row.title}</div>
            <p className="mt-0.5 text-[13px] text-sub">{row.hint}</p>
          </div>
          <Toggle checked={values[row.key]} onChange={(v) => set(row.key, v)} label={row.title} />
        </div>
      ))}

      {isCanada ? (
        <div className="flex items-start justify-between gap-4 py-3.5">
          <div>
            <div className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              Capture CASL express consent (Canada)
              <span className="text-[11px] font-medium text-faint">(required)</span>
            </div>
            <p className="mt-0.5 text-[13px] text-sub">
              Records express consent at point of service, as CASL requires.
            </p>
          </div>
          <Toggle checked disabled onChange={() => {}} label="CASL express consent (always on)" />
        </div>
      ) : null}
    </div>
  );
}
