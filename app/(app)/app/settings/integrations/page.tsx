import { getData } from "@/lib/data";
import { Badge } from "@/components/ds/misc";
import { Icon, type IconName } from "@/components/icons";
import { formatRelative } from "@/lib/utils/format";
import type { Integration } from "@/lib/data/types";
import { SettingsShell } from "../SettingsShell";
import { Callout, SettingsSection } from "../SettingsUI";
import { ReconnectButton } from "./ReconnectButton";
import { SyncGoogleButton } from "@/components/app/SyncGoogleButton";

const PROVIDER_ICON: Record<Integration["provider"], IconName> = {
  google: "google",
  google_places: "map-pin",
  twilio: "message",
  resend: "mail",
  stripe: "credit-card",
};

// The honest consequence if this integration is NOT fully working.
const CONSEQUENCE: Record<Integration["provider"], string> = {
  google: "we can't publish posts or read your Google performance",
  google_places: "your Local Growth Score can't refresh from public data",
  resend: "we can't send email review requests",
  twilio: "SMS review requests can't send — we fall back to email",
  stripe: "we can't process your subscription or issue invoices",
};

function tone(status: Integration["status"]): "primary" | "gold" | "danger" {
  if (status === "connected") return "primary";
  if (status === "pending") return "gold";
  return "danger";
}

function statusIcon(status: Integration["status"]): IconName {
  if (status === "connected") return "check-circle";
  if (status === "pending") return "clock";
  return "alert";
}

function statusLabel(status: Integration["status"]): string {
  if (status === "connected") return "Connected";
  if (status === "pending") return "Pending";
  if (status === "needs_attention") return "Needs attention";
  return "Disconnected";
}

export default async function IntegrationsSettingsPage() {
  const data = await getData();
  const integrations = data.integrations ?? [];

  return (
    <SettingsShell
      title="Integrations"
      sub="What's connected — and exactly what stops working if something drops."
    >
      <SettingsSection title="Sync your Google data">
        <p className="mb-3 text-[14px] text-sub">
          Pulls your real rating, review count and recent reviews now. Your full history and
          performance import once your Business Profile connection is approved.
        </p>
        <SyncGoogleButton label="Sync from Google" />
      </SettingsSection>

      <SettingsSection title="Providers">
        <div className="divide-y divide-hairline">
          {integrations.map((int) => {
            const connected = int.status === "connected";
            return (
              <div
                key={int.id}
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
                    <Icon name={PROVIDER_ICON[int.provider]} size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-bold text-ink">{int.label}</span>
                      <Badge tone={tone(int.status)} icon={statusIcon(int.status)}>
                        {statusLabel(int.status)}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[14px] text-sub">
                      {int.detail}
                      {connected && int.lastSyncAt ? ` · synced ${formatRelative(int.lastSyncAt)}` : ""}
                    </p>
                    {!connected ? (
                      <p className="mt-1 flex items-start gap-1.5 text-[13px] text-danger">
                        <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
                        <span>If this stays down, {CONSEQUENCE[int.provider]}.</span>
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 pl-[52px] sm:pl-3">
                  <ReconnectButton provider={int.provider} label={int.label} connected={connected} />
                </div>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <Callout tone="tip" icon="shield">
        Minimal access, no silent failures — you always see the exact consequence when a connection
        lapses.
      </Callout>
    </SettingsShell>
  );
}
