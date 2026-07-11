import { getData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { Icon, type IconName } from "@/components/icons";
import { formatRelative } from "@/lib/utils/format";
import type { Integration } from "@/lib/data/types";
import { SettingsNav } from "../SettingsNav";
import { ReconnectButton } from "./ReconnectButton";

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
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Integrations</h1>
        <p className="text-[14px] text-sub">
          What&apos;s connected — and exactly what stops working if something drops.
        </p>
      </div>

      <SettingsNav />

      <Card>
        <CardHeader kicker="Connections" title="Providers" />
        <div className="divide-y divide-hairline">
          {integrations.map((int) => {
            const connected = int.status === "connected";
            return (
              <div key={int.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
                    <Icon name={PROVIDER_ICON[int.provider]} size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-bold text-ink">{int.label}</span>
                      <Badge tone={tone(int.status)} icon={connected ? "check-circle" : int.status === "pending" ? "clock" : "alert"}>
                        {statusLabel(int.status)}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[13px] text-sub">{int.detail}</p>
                    {connected ? (
                      int.lastSyncAt ? (
                        <p className="mt-0.5 text-[11px] text-faint">Last sync {formatRelative(int.lastSyncAt)}</p>
                      ) : null
                    ) : (
                      <p className="mt-1 flex items-start gap-1.5 text-[12px] text-danger">
                        <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
                        <span>If this stays down, {CONSEQUENCE[int.provider]}.</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="shrink-0 sm:pl-3">
                  <ReconnectButton label={int.label} connected={connected} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex items-start gap-2 rounded-card border border-hairline bg-primary-wash/40 p-3">
        <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-[12px] text-sub">
          We only ask for the access each feature needs, and we tell you the exact consequence when a
          connection lapses — no silent failures.
        </p>
      </div>
    </div>
  );
}
