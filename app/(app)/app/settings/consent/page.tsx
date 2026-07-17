import { getData } from "@/lib/data";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { consentLabels } from "@/lib/compliance/consent";
import { SettingsShell } from "../SettingsShell";
import { Callout, SettingsSection } from "../SettingsUI";
import { ConsentConfig } from "./ConsentConfig";

export default async function ConsentSettingsPage() {
  const data = await getData();
  const region = data.location.region;
  const labels = consentLabels(region);
  const isCanada = region === "CA";
  const settings = data.workspace.settings ?? {
    serviceConsentDefault: true,
    marketingOptInVisible: true,
    quietHours: true,
    leaderboardVisible: true,
  };

  return (
    <SettingsShell
      title="Consent"
      sub="Two separate permissions — service and marketing — captured honestly, never bundled."
    >
      {/* Configuration */}
      <SettingsSection title="Consent rules">
        <ConsentConfig settings={settings} isCanada={isCanada} />
      </SettingsSection>

      {/* Exact capture wording */}
      <SettingsSection
        kicker="What customers see"
        title="Exact capture wording"
        action={<Badge tone="neutral" icon="lock">Platform-controlled</Badge>}
      >
        <div className="space-y-3">
          <WordingRow tag="Service" text={labels.service} />
          <WordingRow tag="Marketing" text={labels.marketing} optional />
          {labels.casl ? (
            <Callout tone="tip" icon="shield" title="Canada · CASL">
              {labels.casl}
            </Callout>
          ) : null}
        </div>
        <p className="mt-3 text-[13px] text-faint">
          This wording is fixed so the honesty and dual-consent stance survives every theme and
          white-label.
        </p>
      </SettingsSection>
    </SettingsShell>
  );
}

function WordingRow({ tag, text, optional }: { tag: string; text: string; optional?: boolean }) {
  return (
    <div className="rounded-card border border-hairline p-3.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="kicker normal-case">{tag} consent</span>
        {optional ? <Badge tone="sub">Optional</Badge> : <Badge tone="primary">Required</Badge>}
      </div>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 grid size-4 shrink-0 place-items-center rounded border border-primary bg-primary text-white">
          <Icon name="check" size={11} />
        </div>
        <p className="text-[14px] text-ink">{text}</p>
      </div>
    </div>
  );
}
