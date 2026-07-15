import { getData } from "@/lib/data";
import { Card } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Icon, type IconName } from "@/components/icons";
import { formatNumber } from "@/lib/utils/format";
import { CampaignToggle } from "./CampaignToggle";
import type { Channel } from "@/lib/data/types";

const CHANNEL_ICON: Record<Channel, IconName> = {
  email: "mail",
  sms: "message",
  whatsapp: "message",
};

export default async function CampaignsPage() {
  const data = await getData();
  const campaigns = data.campaigns;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-ink">Campaigns</h1>
          <p className="text-[14px] text-sub">
            Consent-safe automations that keep customers coming back.
          </p>
        </div>
        <LinkButton href="/app/campaigns/new" icon="plus">New campaign</LinkButton>
      </div>

      {campaigns.length ? (
        <div className="space-y-4">
          {campaigns.map((c) => {
            const isMarketing = c.consentBasis === "marketing";
            const basisLabel = isMarketing ? "marketing" : "service messages";
            const rate = c.stats.sent > 0 ? Math.round((c.stats.opened / c.stats.sent) * 100) : 0;
            return (
              <Card key={c.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={isMarketing ? "gold" : "primary"} icon={isMarketing ? "megaphone" : "send"}>
                        {isMarketing ? "Marketing" : "Service"}
                      </Badge>
                      {c.isAutomation ? <Badge tone="neutral" icon="refresh">Automation</Badge> : null}
                      <Badge tone={c.status === "active" ? "primary" : "sub"}>{c.status}</Badge>
                    </div>
                    <h2 className="text-[16px] font-bold text-ink">{c.name}</h2>
                    <p className="mt-1 text-[13px] text-sub">{c.body}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <CampaignToggle id={c.id} name={c.name} initialActive={c.status === "active"} />
                    <div className="flex items-center gap-1 text-[12px] text-faint">
                      <Icon name={CHANNEL_ICON[c.channel]} size={14} />
                      <span className="capitalize">{c.channel}</span>
                    </div>
                  </div>
                </div>

                {/* Consent-basis label */}
                <div className="mt-3 flex items-start gap-2 rounded-btn border border-hairline bg-paper px-3 py-2">
                  <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-primary" />
                  <p className="text-[12px] text-sub">
                    Sending to <span className="font-semibold text-ink">{formatNumber(c.audienceConsented)}</span> of{" "}
                    <span className="font-semibold text-ink">{formatNumber(c.audienceTotal)}</span> opted in to {basisLabel}
                  </p>
                </div>

                {/* Live stats */}
                <div className="mt-3 grid grid-cols-4 gap-3 border-t border-hairline pt-3">
                  <Stat label="Enrolled" value={formatNumber(c.audienceConsented)} />
                  <Stat label="Sent" value={formatNumber(c.stats.sent)} />
                  <Stat label="Opened" value={formatNumber(c.stats.opened)} />
                  <Stat label="Open rate" value={`${rate}%`} />
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <p className="py-8 text-center text-[13px] text-faint">No campaigns yet.</p>
        </Card>
      )}

      {/* Campaigns Pro upsell (locked) */}
      <div className="flex items-center justify-between gap-3 rounded-card border border-dashed border-gold/50 bg-gold-tint/40 p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-gold text-ink">
            <Icon name="lock" size={18} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[14px] font-bold text-ink">
              Campaigns Pro <Badge tone="gold">Pro</Badge>
            </div>
            <p className="text-[13px] text-sub">Multi-step journeys, segments, and A/B testing.</p>
          </div>
        </div>
        <LinkButton href="/app/settings/billing" variant="gold" size="sm" iconRight="chevron-right">
          Upgrade
        </LinkButton>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[18px] font-extrabold tabular-nums text-ink">{value}</div>
      <div className="kicker">{label}</div>
    </div>
  );
}
