import { getData } from "@/lib/data";
import { Card } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Badge, EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon, type IconName } from "@/components/icons";
import { Funnel } from "@/components/charts";
import { formatNumber } from "@/lib/utils/format";
import { CampaignToggle } from "./CampaignToggle";
import type { Campaign, Channel } from "@/lib/data/types";

const CHANNEL_ICON: Record<Channel, IconName> = {
  email: "mail",
  sms: "message",
  whatsapp: "message",
};

export default async function CampaignsPage() {
  const data = await getData();
  const automations = data.campaigns.filter((c) => c.isAutomation);
  const oneOff = data.campaigns.filter((c) => !c.isAutomation);
  const hasCampaigns = data.campaigns.length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Campaigns"
        sub="Consent-safe automations that keep customers coming back."
        actions={<LinkButton href="/app/campaigns/new" icon="plus">New campaign</LinkButton>}
      />

      {/* Always-on automation rules */}
      {automations.length ? (
        <section className="space-y-4">
          <SectionHeader
            icon="refresh"
            title="Automations"
            sub="Always-on rules that send on their own. Toggle any rule off and it stops immediately."
          />
          <div className="space-y-4">
            {automations.map((c) => (
              <CampaignCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      ) : null}

      {/* One-off campaigns */}
      {oneOff.length ? (
        <section className="space-y-4">
          <SectionHeader
            icon="send"
            title="One-off campaigns"
            sub="Individual sends to a consented audience."
          />
          <div className="space-y-4">
            {oneOff.map((c) => (
              <CampaignCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      ) : null}

      {!hasCampaigns ? (
        <Card>
          <EmptyState
            icon="megaphone"
            title="No campaigns yet"
            description="Create a consent-safe automation to keep customers coming back."
          />
        </Card>
      ) : null}

      {/* Campaigns Pro upsell (locked) — restrained, no gold-as-celebration. */}
      <div className="flex flex-col gap-3 rounded-card border border-hairline bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
            <Icon name="lock" size={18} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
              Campaigns Pro <Badge tone="neutral">Pro plan</Badge>
            </div>
            <p className="text-[14px] text-sub">Multi-step journeys, segments, and A/B testing.</p>
          </div>
        </div>
        <LinkButton href="/app/settings/billing" variant="secondary" size="sm" iconRight="chevron-right">
          See plans
        </LinkButton>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, sub }: { icon: IconName; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
        <Icon name={icon} size={15} />
      </div>
      <div>
        <h2 className="text-[16px] font-bold text-ink">{title}</h2>
        <p className="text-[13px] text-sub">{sub}</p>
      </div>
    </div>
  );
}

function CampaignCard({ c }: { c: Campaign }) {
  const isMarketing = c.consentBasis === "marketing";
  const basisLabel = isMarketing ? "marketing" : "service messages";
  const rate = c.stats.sent > 0 ? Math.round((c.stats.opened / c.stats.sent) * 100) : 0;

  // Real performance funnel — only the stages we have honest counts for.
  const funnelStages = [
    { label: "Eligible", value: c.audienceConsented },
    { label: "Sent", value: c.stats.sent },
    { label: "Opened", value: c.stats.opened },
    { label: "Clicked", value: c.stats.clicked },
  ];
  const hasPerformance = c.stats.sent > 0;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {/* Consent basis — the legal basis this send relies on. */}
            <Badge tone={isMarketing ? "primary" : "neutral"} icon="shield">
              {isMarketing ? "Marketing consent" : "Service consent"}
            </Badge>
            {c.isAutomation ? <Badge tone="neutral" icon="refresh">Automation</Badge> : null}
            <Badge tone={c.status === "active" ? "primary" : "sub"}>
              {c.status === "active" ? "Active" : c.status.charAt(0).toUpperCase() + c.status.slice(1)}
            </Badge>
          </div>
          <h3 className="text-[17px] font-bold text-ink">{c.name}</h3>
          <p className="mt-1 text-[14px] text-sub">{c.body}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <CampaignToggle id={c.id} name={c.name} initialActive={c.status === "active"} />
          <div className="flex items-center gap-1 text-[12px] text-faint">
            <Icon name={CHANNEL_ICON[c.channel]} size={14} />
            <span className="capitalize">{c.channel}</span>
          </div>
        </div>
      </div>

      {/* Live consent-basis eligibility line — only when audience data exists */}
      {c.audienceTotal > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-btn border border-hairline bg-paper px-3 py-2">
          <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-[13px] text-sub">
            Sending to <span className="font-semibold tabular-nums text-ink">{formatNumber(c.audienceConsented)}</span> of{" "}
            <span className="font-semibold tabular-nums text-ink">{formatNumber(c.audienceTotal)}</span> eligible (opted in to{" "}
            {basisLabel})
          </p>
        </div>
      ) : null}

      {/* Real performance funnel — proportional widths, honest drop-off. */}
      {hasPerformance ? (
        <div className="mt-4 border-t border-hairline pt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="kicker">Performance to date</span>
            <span className="data-chip text-sub">{rate}% open rate</span>
          </div>
          <Funnel stages={funnelStages} orientation="horizontal" title={`${c.name} performance`} />
        </div>
      ) : (
        <div className="mt-3 rounded-btn border border-hairline bg-paper px-3 py-2.5 text-[13px] text-faint">
          No sends yet — performance appears here after the first message goes out.
        </div>
      )}
    </Card>
  );
}
