import { notFound } from "next/navigation";
import { getData } from "@/lib/data";
import { Card } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon, type IconName } from "@/components/icons";
import { formatNumber, formatDate, maskEmail, maskPhone } from "@/lib/utils/format";
import { emailEnabled } from "@/lib/email";
import { smsEnabled } from "@/lib/sms/twilio";
import { previewCampaign } from "@/lib/campaigns/runner";
import type {
  CampaignDeliveryState,
  CampaignRecipient,
  CampaignRecipientOutcome,
} from "@/lib/data/types";
import { CampaignSendButton } from "../CampaignSendButton";

/**
 * Delivery tracking for one campaign.
 *
 * Everything here comes from the stored per-recipient outcomes, so the page
 * can only ever show what actually happened — including "nothing was sent,
 * here is what is missing".
 */

const STATE_LABEL: Record<CampaignDeliveryState, string> = {
  not_configured: "Not sent — delivery not connected",
  blocked: "Not sent — blocked",
  held: "Held — outside sending hours",
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

const OUTCOME_LABEL: Record<CampaignRecipientOutcome, string> = {
  pending: "Not attempted",
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
  held: "Held",
};

const OUTCOME_ICON: Record<CampaignRecipientOutcome, IconName> = {
  pending: "clock",
  sent: "check-circle",
  failed: "alert",
  skipped: "x",
  held: "clock",
};

const OUTCOME_CLASS: Record<CampaignRecipientOutcome, string> = {
  pending: "text-faint",
  sent: "text-primary",
  failed: "text-danger",
  skipped: "text-sub",
  held: "text-gold-deep",
};

function maskDestination(recipient: CampaignRecipient): string {
  return recipient.channel === "email"
    ? maskEmail(recipient.destination)
    : maskPhone(recipient.destination);
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const data = await getData();
  const campaign = data.campaigns.find((item) => item.id === campaignId);
  if (!campaign) notFound();

  const delivery = campaign.delivery;
  const recipients = delivery?.snapshot?.recipients ?? [];
  const channelReady = campaign.channel === "email" ? emailEnabled() : smsEnabled();
  const counts = {
    sent: campaign.stats.sent,
    failed: campaign.stats.failed ?? 0,
    skipped: campaign.stats.skipped ?? 0,
    held: campaign.stats.held ?? 0,
  };
  const attempted = counts.sent + counts.failed + counts.skipped + counts.held > 0;

  // For anything not yet sent, recompute against TODAY's consent and quota —
  // a draft saved last week may have a different eligible audience now.
  const live =
    campaign.status === "sent"
      ? null
      : previewCampaign({
          data,
          draft: {
            channel: campaign.channel,
            consentBasis: campaign.consentBasis,
            subject: campaign.subject,
            body: campaign.body,
          },
        });

  return (
    <div className="space-y-5">
      <div>
        <LinkButton href="/app/campaigns" variant="ghost" size="sm" icon="chevron-left" className="-ml-2 mb-1">
          Campaigns
        </LinkButton>
        <PageHeader
          title={campaign.name}
          sub={
            <>
              {campaign.channel === "email" ? "Email" : "SMS"} ·{" "}
              {campaign.consentBasis === "marketing" ? "Marketing consent" : "Service consent"} ·
              created {formatDate(campaign.createdAt)}
            </>
          }
        />
      </div>

      {/* Delivery status — the honest headline. */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {delivery ? (
            <Badge tone={STATE_TONE[delivery.state]} icon="send">
              {STATE_LABEL[delivery.state]}
            </Badge>
          ) : (
            <Badge tone="neutral" icon="file">Draft — never sent</Badge>
          )}
          {campaign.scheduledAt ? (
            <Badge tone="neutral" icon="clock">Scheduled {formatDate(campaign.scheduledAt)}</Badge>
          ) : null}
        </div>

        <p className="text-[14px] text-sub">
          {delivery?.note ??
            "This campaign has never been sent. Nothing has gone to any customer."}
        </p>

        {delivery?.missing?.length ? (
          <div className="rounded-btn border border-gold/40 bg-gold-tint px-3 py-2.5">
            <div className="text-[13px] font-bold text-ink">What&apos;s missing</div>
            <ul className="mt-1 space-y-0.5">
              {delivery.missing.map((item) => (
                <li key={item} className="font-mono text-[12px] text-gold-deep">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {delivery?.attemptedAt ? (
          <p className="text-[12px] text-faint">Last attempt {formatDate(delivery.attemptedAt)}</p>
        ) : null}
      </Card>

      {/* Real counters — from stored per-recipient outcomes, never hardcoded. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <OutcomeTile icon="check-circle" label="Sent" value={counts.sent} tone="text-primary" />
        <OutcomeTile icon="alert" label="Failed" value={counts.failed} tone="text-danger" />
        <OutcomeTile icon="x" label="Skipped" value={counts.skipped} tone="text-sub" />
        <OutcomeTile icon="clock" label="Held" value={counts.held} tone="text-gold-deep" />
      </div>

      {/* Frozen audience */}
      <Card className="space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
            <Icon name="shield" size={15} />
          </div>
          <div>
            <h2 className="text-[16px] font-bold text-ink">Audience snapshot</h2>
            <p className="text-[13px] text-sub">
              {delivery?.snapshot
                ? `Frozen ${formatDate(delivery.snapshot.takenAt)} — this list does not change when consent changes later.`
                : "No audience has been committed yet. It is captured the moment you send or schedule."}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-btn border border-hairline bg-paper px-3 py-2">
          <Icon name="users" size={14} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-[13px] text-sub">
            <span className="font-semibold tabular-nums text-ink">
              {formatNumber(campaign.audienceConsented)}
            </span>{" "}
            of{" "}
            <span className="font-semibold tabular-nums text-ink">
              {formatNumber(campaign.audienceTotal)}
            </span>{" "}
            customers were eligible
          </p>
        </div>

        {campaign.excluded.length ? (
          <ul className="space-y-1">
            {campaign.excluded.map((entry) => (
              <li
                key={entry.reason}
                className="flex items-center justify-between rounded-btn bg-paper px-3 py-1.5 text-[12px]"
              >
                <span className="text-sub">{entry.reason}</span>
                <span className="data-chip tabular-nums text-ink">{formatNumber(entry.count)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {/* Per-recipient outcomes */}
      {recipients.length ? (
        <Card padded={false}>
          <div className="border-b border-hairline px-4 py-3">
            <h2 className="text-[16px] font-bold text-ink">Delivery log</h2>
            <p className="text-[13px] text-sub">
              One row per snapshotted recipient. Addresses are masked.
            </p>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse text-[14px]">
              <caption className="sr-only">Per-recipient delivery outcomes</caption>
              <thead>
                <tr className="border-b border-hairline">
                  <th scope="col" className="px-4 py-2.5 text-left text-[12px] font-bold text-sub">Customer</th>
                  <th scope="col" className="px-4 py-2.5 text-left text-[12px] font-bold text-sub">Destination</th>
                  <th scope="col" className="px-4 py-2.5 text-left text-[12px] font-bold text-sub">Outcome</th>
                  <th scope="col" className="px-4 py-2.5 text-left text-[12px] font-bold text-sub">Detail</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((recipient) => (
                  <tr key={recipient.customerId} className="border-b border-hairline last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{recipient.name}</td>
                    <td className="px-4 py-3 tabular-nums text-sub">{maskDestination(recipient)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 font-semibold ${OUTCOME_CLASS[recipient.outcome]}`}>
                        <Icon name={OUTCOME_ICON[recipient.outcome]} size={14} />
                        {OUTCOME_LABEL[recipient.outcome]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-sub">{recipient.detail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Message */}
      <Card className="space-y-2">
        <div className="text-[13px] font-bold text-sub">Message</div>
        {campaign.subject ? (
          <div className="text-[15px] font-semibold text-ink">{campaign.subject}</div>
        ) : null}
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink/90">{campaign.body}</p>
      </Card>

      {/* Send / retry */}
      {live ? (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="kicker">If you send now</span>
            <span className="data-chip tabular-nums text-ink">
              {formatNumber(live.eligible)} eligible · {formatNumber(live.estimate.creditsRequired)}{" "}
              credit{live.estimate.creditsRequired === 1 ? "" : "s"}
            </span>
          </div>
          <p className={live.estimate.withinAllowance ? "text-[13px] text-sub" : "text-[13px] font-semibold text-danger"}>
            {live.estimate.message}
          </p>

          {live.blocking.map((message) => (
            <p key={message} className="flex items-start gap-2 rounded-btn border border-danger/40 bg-danger-tint px-3 py-2.5 text-[13px] text-ink">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-danger" />
              <span>
                <span className="font-bold text-danger">Blocked. </span>
                {message}
              </span>
            </p>
          ))}

          <CampaignSendButton
            campaignId={campaign.id}
            label={attempted ? "Try sending again" : `Send to ${formatNumber(live.eligible)}`}
            size="lg"
            fullWidth
          />
          {!channelReady ? (
            <p className="text-[13px] text-danger">
              {campaign.channel === "email"
                ? "Email delivery is not connected — this will record the attempt and send nothing."
                : "SMS delivery is not connected — this will record the attempt and send nothing."}
            </p>
          ) : (
            <p className="text-[13px] text-faint">
              Sending freezes a fresh audience and re-checks every recipient&apos;s consent first.
            </p>
          )}
        </Card>
      ) : null}
    </div>
  );
}

function OutcomeTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: IconName;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-card border border-hairline bg-card p-3.5 shadow-sm">
      <div className={`flex items-center gap-1.5 ${tone}`}>
        <Icon name={icon} size={14} />
        <span className="text-[12px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-1 text-[26px] font-extrabold leading-none tabular-nums text-ink">
        {formatNumber(value)}
      </div>
    </div>
  );
}
