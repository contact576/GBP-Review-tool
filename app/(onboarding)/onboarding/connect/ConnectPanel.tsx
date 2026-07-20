import { Badge, Card } from "@/components/ds";
import { Icon, type IconName } from "@/components/icons";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import type { Integration } from "@/lib/data/types";

/**
 * Real GBP connect panel — states come from the workspace's google
 * integration row, not local component state:
 *  - disconnected + credentials configured → real OAuth link (/api/google/connect)
 *  - disconnected + no credentials         → honest "not configured" note
 *  - connected / pending / needs_attention → the stored status + detail verbatim
 */

const SCOPES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "eye",
    title: "Read reviews & performance",
    body: "See new reviews, ratings, and how people find you on Maps and Search.",
  },
  {
    icon: "pencil",
    title: "Prepare profile improvements",
    body: "Review suggested photos, services, posts, and replies before applying them in Google.",
  },
];

export interface GoogleIntegrationState {
  status: Integration["status"];
  detail: string;
}

export function ConnectPanel({
  integration,
  googleEnabled,
}: {
  integration: GoogleIntegrationState | null;
  googleEnabled: boolean;
}) {
  const status = integration?.status ?? "disconnected";

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="kicker">Why connect</div>
        {SCOPES.map((s) => (
          <div key={s.title} className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
              <Icon name={s.icon} size={18} />
            </div>
            <div>
              <div className="text-[14px] font-semibold text-ink">{s.title}</div>
              <div className="text-[13px] text-sub">{s.body}</div>
            </div>
          </div>
        ))}
      </Card>

      {status === "connected" ? (
        <div className="flex items-center gap-3 rounded-card border border-primary/30 bg-primary-tint px-4 py-3.5">
          <Icon name="check-circle" size={22} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-primary-dark">Connected to Google</div>
            <div className="text-[12px] text-primary-dark/80">
              {integration?.detail || "Profile data will sync"}
            </div>
          </div>
          <Badge tone="primary" icon="check">Live</Badge>
        </div>
      ) : status === "needs_attention" || status === "pending" ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-card border border-gold/40 bg-gold-tint px-4 py-3.5">
            <Icon
              name={status === "pending" ? "clock" : "alert"}
              size={20}
              className="mt-0.5 shrink-0 text-gold-deep"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-ink">
                {status === "pending" ? "Connection pending" : "Connected — attention needed"}
              </div>
              <div className="mt-0.5 text-[12px] leading-relaxed text-sub">
                {integration?.detail || "Check Settings → Integrations for details."}
              </div>
            </div>
          </div>
          {googleEnabled ? (
            <a
              href="/api/google/connect"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-btn border border-hairline bg-card px-4 text-[14px] font-semibold text-ink transition-all hover:bg-primary-wash"
            >
              <Icon name="refresh" size={18} />
              Reconnect Google
            </a>
          ) : null}
        </div>
      ) : googleEnabled ? (
        <a
          href="/api/google/connect"
          className="inline-flex h-12 min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-btn border border-hairline bg-card px-6 text-[15px] font-semibold text-ink shadow-sm transition-all hover:bg-primary-wash"
        >
          <Icon name="google" size={18} />
          Connect Google
        </a>
      ) : (
        <div className="flex items-start gap-3 rounded-card border border-hairline bg-card px-4 py-3.5">
          <Icon name="alert" size={20} className="mt-0.5 shrink-0 text-gold-deep" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-ink">
              Google connection isn&apos;t configured yet
            </div>
            <div className="mt-0.5 text-[12px] leading-relaxed text-sub">
              Add Google credentials (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET — see SETUP) to
              enable connecting your Business Profile. You can keep going and connect later in
              Settings → Integrations.
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-btn border border-hairline bg-card px-3 py-2.5 text-[12px] text-sub">
        <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-primary" />
        <span>{MICROCOPY.nameStuffBlocked} Profile suggestions are not published automatically yet.</span>
      </div>
    </div>
  );
}
