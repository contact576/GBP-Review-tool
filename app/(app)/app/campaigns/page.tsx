import Link from "next/link";
import { getData } from "@/lib/data";
import { Card } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Badge, EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon, type IconName } from "@/components/icons";
import { Funnel } from "@/components/charts";
import { formatNumber, formatDate } from "@/lib/utils/format";
import { emailEnabled } from "@/lib/email";
import { smsEnabled } from "@/lib/sms/twilio";
import { hasFeature, upgradeFor } from "@/lib/billing/plans";
import type { Campaign, CampaignDeliveryState, Channel } from "@/lib/data/types";

const CHANNEL_ICON: Record<Channel, IconName> = {
  email: "mail",
  sms: "message",
  whatsapp: "message",
};

const STATE_LABEL: Record<CampaignDeliveryState, string> = {
  not_configured: "Not sent — delivery offline",
  blocked: "Not sent — blocked",
  held: "Held for quiet hours",
  scheduled: "Scheduled",
  delivered: "Delivered",
  partial: "Partly delivered",
};

const STATE_TONE: Record<CampaignDeliveryState, "primary" | "danger" | "gold" | "neutral"> = {
  not_configured: "gold",
  blocked: "danger",
  held: "gold",
  scheduled: "neutral",
  delivered: "primary",
  partial: "gold",
};

export default async function CampaignsPage() {
  const data = await getData();
  // The upsell below is an upsell, not a page header: a workspace that already
  // pays for campaigns_pro must never be told it is locked. Named from the plan
  // catalog for the same reason the badge is — there is no "Pro" plan to sell.
  const proPlan = upgradeFor("campaigns_pro");
  const hasCampaignsPro = hasFeature(
    data.subscription.tier,
    "campaigns_pro",
    data.subscription.status === "trialing",
  );
  const automations = data.campaigns.filter((c) => c.isAutomation);
  const oneOff = data.campaigns.filter((c) => !c.isAutomation);
  const hasCampaigns = data.campaigns.length > 0;

  // Read from the real env, so the page never claims a capability the deploy
  // does not have — and never withholds one it does.
  const emailReady = emailEnabled();
  const smsReady = smsEnabled();
  const anyReady = emailReady || smsReady;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Campaigns"
        sub={
          anyReady
            ? "Consent-safe sends over your connected providers."
            : "Prepare consent-safe drafts. Connect a provider to send."
        }
        actions={<LinkButton href="/app/campaigns/new" icon="plus">New campaign</LinkButton>}
      />

      {/* Provider readiness — stated once, plainly, at the top. */}
      <div className="flex flex-col gap-2 rounded-card border border-hairline bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={emailReady ? "primary" : "gold"} icon="mail">
            Email {emailReady ? "connected" : "not connected"}
          </Badge>
          <Badge tone={smsReady ? "primary" : "gold"} icon="message">
            SMS {smsReady ? "connected" : "not connected"}
          </Badge>
        </div>
        <p className="text-[13px] text-sub">
          {anyReady
            ? "Sends go out over the connected channels. Scheduled campaigns drain once a day."
            : "Drafts save and schedules hold, but nothing leaves until a provider key is set."}
        </p>
      </div>

      {/* Always-on automation rules */}
      {automations.length ? (
        <section className="space-y-4">
          <SectionHeader
            icon="refresh"
            title="Automations"
            sub="Recurring sends against a consent-filtered audience."
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
            sub="Drafts, schedules and completed sends."
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
            description="Create a consent-safe campaign to keep customers coming back."
          />
        </Card>
      ) : null}

      {/* Campaigns Pro upsell (locked) — restrained, no gold-as-celebration.
          Hidden once the workspace owns the feature. */}
      {hasCampaignsPro ? null : (
        <div className="flex flex-col gap-3 rounded-card border border-hairline bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
              <Icon name="lock" size={18} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
                Campaigns Pro <Badge tone="neutral">{proPlan.name} and up</Badge>
              </div>
              <p className="text-[14px] text-sub">Multi-step journeys, segments, and A/B testing.</p>
            </div>
          </div>
          <LinkButton href="/app/settings/billing" variant="secondary" size="sm" iconRight="chevron-right">
            See plans
          </LinkButton>
        </div>
      )}
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
  const failed = c.stats.failed ?? 0;
  const skipped = c.stats.skipped ?? 0;

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
            <Badge tone={c.status === "active" || c.status === "sent" ? "primary" : "sub"}>
              {c.status === "active" ? "Active" : c.status.charAt(0).toUpperCase() + c.status.slice(1)}
            </Badge>
          </div>
          <h3 className="text-[17px] font-bold text-ink">
            <Link href={`/app/campaigns/${c.id}`} className="hover:text-primary">
              {c.name}
            </Link>
          </h3>
          <p className="mt-1 text-[14px] text-sub">{c.body}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {c.delivery ? (
            <Badge tone={STATE_TONE[c.delivery.state]} icon="send">
              {STATE_LABEL[c.delivery.state]}
            </Badge>
          ) : (
            <Badge tone="neutral" icon="file">Draft</Badge>
          )}
          <div className="flex items-center gap-1 text-[12px] text-faint">
            <Icon name={CHANNEL_ICON[c.channel]} size={14} />
            <span className="capitalize">{c.channel}</span>
          </div>
        </div>
      </div>

      {/* What actually happened on the last attempt. */}
      {c.delivery ? (
        <div className="mt-3 flex items-start gap-2 rounded-btn border border-hairline bg-paper px-3 py-2">
          <Icon name="send" size={14} className="mt-0.5 shrink-0 text-sub" />
          <p className="text-[13px] text-sub">{c.delivery.note}</p>
        </div>
      ) : null}

      {c.scheduledAt && c.status === "scheduled" ? (
        <div className="mt-2 flex items-center gap-2 rounded-btn border border-hairline bg-paper px-3 py-2 text-[13px] text-sub">
          <Icon name="clock" size={14} className="shrink-0 text-primary" />
          Goes out on the first daily send run after {formatDate(c.scheduledAt)}
        </div>
      ) : null}

      {/* Live consent-basis eligibility line — only when audience data exists */}
      {c.audienceTotal > 0 ? (
        <div className="mt-2 flex items-start gap-2 rounded-btn border border-hairline bg-paper px-3 py-2">
          <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-[13px] text-sub">
            Audience includes <span className="font-semibold tabular-nums text-ink">{formatNumber(c.audienceConsented)}</span> of{" "}
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
            <span className="data-chip tabular-nums text-sub">{rate}% open rate</span>
          </div>
          <Funnel stages={funnelStages} orientation="horizontal" title={`${c.name} performance`} />
          {failed > 0 || skipped > 0 ? (
            <p className="mt-3 text-[13px] text-sub">
              <span className="tabular-nums font-semibold text-ink">{formatNumber(failed)}</span> failed ·{" "}
              <span className="tabular-nums font-semibold text-ink">{formatNumber(skipped)}</span> skipped
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 rounded-btn border border-hairline bg-paper px-3 py-2.5 text-[13px] text-faint">
          No sends yet — performance appears here after the first message goes out.
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <LinkButton href={`/app/campaigns/${c.id}`} variant="ghost" size="sm" iconRight="chevron-right">
          Delivery detail
        </LinkButton>
      </div>
    </Card>
  );
}
