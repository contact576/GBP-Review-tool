import "server-only";
import type { DataProvider } from "@/lib/data/provider";
import type {
  Campaign,
  CampaignAudienceSnapshot,
  CampaignDeliveryState,
} from "@/lib/data/types";
import { buildAudienceSnapshot } from "./audience";
import { estimateCampaignCredits, type CreditEstimate } from "./credits";
import { checkCampaignContent } from "./content";
import { runCampaignSend, runCampaignTestSend, type CampaignTransport } from "./send";
import { liveTransport } from "./transport";

/**
 * Storage-aware wrapper around the pure send pipeline.
 *
 * `lib/campaigns/send.ts` decides; this decides *and persists*, in one place,
 * so the server action and the cron drain behave identically — a campaign that
 * is scheduled goes out under exactly the rules it would have gone out under
 * had the owner clicked Send.
 */

export interface CampaignCommitResult {
  /** True only when at least one real message was accepted by a provider. */
  ok: boolean;
  state: CampaignDeliveryState;
  /** Owner-facing sentence, safe to show verbatim. Never claims a fake send. */
  note: string;
  /** Env vars to set when `state === "not_configured"`. */
  missing?: string[];
  counts: { sent: number; failed: number; skipped: number; held: number };
  eligible: number;
  creditsUsed: number;
}

export interface CommitCampaignSendInput {
  provider: DataProvider;
  workspaceId: string;
  campaignId: string;
  baseUrl: string;
  now?: Date;
  /** Overridable so tests never reach Resend or Twilio. */
  transport?: CampaignTransport;
  /**
   * Freeze a new audience. A scheduled drain passes false so the campaign
   * sends to the list it committed to, not to whoever qualifies today.
   */
  freshSnapshot?: boolean;
}

function notFound(): CampaignCommitResult {
  return {
    ok: false,
    state: "blocked",
    note: "That campaign no longer exists.",
    counts: { sent: 0, failed: 0, skipped: 0, held: 0 },
    eligible: 0,
    creditsUsed: 0,
  };
}

export async function commitCampaignSend(
  input: CommitCampaignSendInput,
): Promise<CampaignCommitResult> {
  const { provider, workspaceId, campaignId } = input;
  const now = input.now ?? new Date();
  const data = await provider.getData(workspaceId);
  const campaign = data?.campaigns.find((item) => item.id === campaignId);
  if (!data || !campaign) return notFound();

  // Reuse the committed snapshot when draining a schedule; freeze a new one
  // when sending now. Either way the recipient list is fixed BEFORE the first
  // message goes out, so a mid-send consent change cannot half-rewrite it.
  const snapshot: CampaignAudienceSnapshot =
    input.freshSnapshot === false && campaign.delivery?.snapshot
      ? campaign.delivery.snapshot
      : buildAudienceSnapshot({
          customers: data.customers,
          suppression: data.suppression,
          consentBasis: campaign.consentBasis,
          channel: campaign.channel,
          now,
        });

  const result = await runCampaignSend({
    workspaceId,
    campaign,
    snapshot,
    customers: data.customers,
    suppression: data.suppression,
    location: {
      name: data.location.name,
      timezone: data.location.timezone || data.workspace.timezone,
      address: data.location.address,
    },
    usage: data.subscription.usage,
    quietHoursEnabled: data.workspace.settings?.quietHours !== false,
    baseUrl: input.baseUrl,
    brand: data.workspace.whiteLabel?.brandName,
    now,
    transport: input.transport ?? liveTransport,
  });

  await provider.recordCampaignDelivery(workspaceId, campaignId, {
    status: result.status,
    // A held SMS campaign keeps its schedule so the next drain retries it
    // inside the recipient's local window; anything else is done waiting.
    scheduledAt: result.delivery.state === "held" ? (campaign.scheduledAt ?? now.toISOString()) : null,
    stats: {
      sent: result.counts.sent,
      failed: result.counts.failed,
      skipped: result.counts.skipped,
      held: result.counts.held,
    },
    delivery: result.delivery,
    audienceTotal: snapshot.total,
    audienceConsented: snapshot.eligible,
    excluded: snapshot.excluded,
    consumeSmsCredits: result.creditsUsed,
  });

  return {
    ok: result.didSend,
    state: result.delivery.state,
    note: result.delivery.note,
    missing: result.delivery.missing,
    counts: result.counts,
    eligible: snapshot.eligible,
    creditsUsed: result.creditsUsed,
  };
}

export interface ScheduleCampaignResult {
  ok: boolean;
  note: string;
  eligible: number;
  scheduledAt?: string;
}

/**
 * Commit a future send. The audience is frozen NOW, not at drain time — the
 * owner is told "this goes to 214 people", and that promise is what gets kept.
 */
export async function scheduleCampaign(input: {
  provider: DataProvider;
  workspaceId: string;
  campaignId: string;
  scheduledAt: string;
  now?: Date;
}): Promise<ScheduleCampaignResult> {
  const now = input.now ?? new Date();
  const when = new Date(input.scheduledAt);
  if (Number.isNaN(when.getTime())) {
    return { ok: false, note: "That send time could not be read.", eligible: 0 };
  }
  if (when.getTime() <= now.getTime()) {
    return { ok: false, note: "Pick a send time in the future.", eligible: 0 };
  }

  const data = await input.provider.getData(input.workspaceId);
  const campaign = data?.campaigns.find((item) => item.id === input.campaignId);
  if (!data || !campaign) return { ok: false, note: "That campaign no longer exists.", eligible: 0 };

  const content = checkCampaignContent({
    subject: campaign.subject,
    body: campaign.body,
    businessName: data.location.name,
  });
  if (!content.ok) {
    return {
      ok: false,
      note: content.blocking.map((flag) => flag.message).join(" "),
      eligible: 0,
    };
  }

  const snapshot = buildAudienceSnapshot({
    customers: data.customers,
    suppression: data.suppression,
    consentBasis: campaign.consentBasis,
    channel: campaign.channel,
    now,
  });
  if (snapshot.eligible === 0) {
    return { ok: false, note: "This campaign has no eligible recipients.", eligible: 0 };
  }

  const scheduledAt = when.toISOString();
  await input.provider.recordCampaignDelivery(input.workspaceId, input.campaignId, {
    status: "scheduled",
    scheduledAt,
    audienceTotal: snapshot.total,
    audienceConsented: snapshot.eligible,
    excluded: snapshot.excluded,
    delivery: {
      state: "scheduled",
      note: `Scheduled for ${scheduledAt}. The audience of ${snapshot.eligible} was frozen now; anyone who opts out before then is still dropped at send time.`,
      snapshot,
    },
  });

  return { ok: true, note: "Scheduled.", eligible: snapshot.eligible, scheduledAt };
}

/**
 * Fold a provider delivery receipt (Twilio status callback) into the campaign.
 *
 * The synchronous send only knows the message was ACCEPTED. "Delivered" and
 * "undelivered" arrive minutes later, so without this the counters would
 * permanently overstate delivery. Matching is by the provider's own message id,
 * which is recorded per recipient at send time.
 */
export async function applyCampaignDeliveryReceipt(input: {
  provider: DataProvider;
  workspaceId: string;
  campaignId: string;
  providerId: string;
  outcome: "sent" | "failed";
  detail?: string;
}): Promise<boolean> {
  const campaign = await input.provider.getCampaign(input.workspaceId, input.campaignId);
  const delivery = campaign?.delivery;
  const snapshot = delivery?.snapshot;
  if (!campaign || !delivery || !snapshot) return false;

  const index = snapshot.recipients.findIndex(
    (recipient) => recipient.providerId === input.providerId,
  );
  const current = snapshot.recipients[index];
  if (!current || current.outcome === input.outcome) return false;

  const recipients = [...snapshot.recipients];
  recipients[index] = { ...current, outcome: input.outcome, detail: input.detail };

  const counts = { sent: 0, failed: 0, skipped: 0, held: 0 };
  for (const recipient of recipients) {
    if (recipient.outcome === "sent") counts.sent += 1;
    else if (recipient.outcome === "failed") counts.failed += 1;
    else if (recipient.outcome === "held") counts.held += 1;
    else counts.skipped += 1;
  }

  await input.provider.recordCampaignDelivery(input.workspaceId, input.campaignId, {
    stats: {
      sent: counts.sent,
      failed: counts.failed,
      skipped: counts.skipped,
      held: counts.held,
    },
    delivery: {
      ...delivery,
      state: counts.sent === 0 ? "blocked" : counts.sent === recipients.length ? "delivered" : "partial",
      note:
        counts.sent === recipients.length
          ? `Delivered to all ${counts.sent} recipient${counts.sent === 1 ? "" : "s"}.`
          : `Delivered to ${counts.sent} of ${recipients.length}. ${counts.failed} failed, ${counts.skipped} skipped.`,
      snapshot: { ...snapshot, recipients },
    },
  });
  return true;
}

export interface DrainResult {
  considered: number;
  sent: number;
  failed: number;
  skipped: number;
  held: number;
  campaigns: { campaignId: string; state: CampaignDeliveryState; note: string }[];
}

/**
 * Send every scheduled campaign whose time has passed.
 *
 * Vercel Hobby allows a single DAILY cron, so a campaign scheduled for 3pm
 * goes out at the next daily run rather than on the minute. That is stated in
 * the composer, because a schedule that silently drifts is worse than one that
 * is honest about its granularity.
 */
export async function drainDueCampaigns(input: {
  provider: DataProvider;
  baseUrl: string;
  now?: Date;
  limit?: number;
  transport?: CampaignTransport;
}): Promise<DrainResult> {
  const now = input.now ?? new Date();
  const due = await input.provider.listDueCampaigns(now.toISOString(), input.limit ?? 25);
  const result: DrainResult = {
    considered: due.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    held: 0,
    campaigns: [],
  };

  for (const item of due) {
    const outcome = await commitCampaignSend({
      provider: input.provider,
      workspaceId: item.workspaceId,
      campaignId: item.campaign.id,
      baseUrl: input.baseUrl,
      now,
      transport: input.transport,
      freshSnapshot: false,
    });
    result.sent += outcome.counts.sent;
    result.failed += outcome.counts.failed;
    result.skipped += outcome.counts.skipped;
    result.held += outcome.counts.held;
    result.campaigns.push({
      campaignId: item.campaign.id,
      state: outcome.state,
      note: outcome.note,
    });
  }
  return result;
}

// ── Estimates & test sends ──────────────────────────────────

export interface CampaignPreview {
  eligible: number;
  total: number;
  excluded: { reason: string; count: number }[];
  estimate: CreditEstimate;
  blocking: string[];
  warnings: string[];
  /** Which transport is live right now, so the UI never over-promises. */
  channelReady: boolean;
}

export function previewCampaign(input: {
  data: NonNullable<Awaited<ReturnType<DataProvider["getData"]>>>;
  draft: Pick<Campaign, "channel" | "consentBasis" | "subject" | "body">;
  transport?: CampaignTransport;
}): CampaignPreview {
  const transport = input.transport ?? liveTransport;
  const snapshot = buildAudienceSnapshot({
    customers: input.data.customers,
    suppression: input.data.suppression,
    consentBasis: input.draft.consentBasis,
    channel: input.draft.channel,
  });
  const content = checkCampaignContent({
    subject: input.draft.subject,
    body: input.draft.body,
    businessName: input.data.location.name,
  });
  return {
    eligible: snapshot.eligible,
    total: snapshot.total,
    excluded: snapshot.excluded,
    estimate: estimateCampaignCredits({
      channel: input.draft.channel,
      recipients: snapshot.eligible,
      body: input.draft.body,
      usage: input.data.subscription.usage,
    }),
    blocking: content.blocking.map((flag) => flag.message),
    warnings: content.warnings.map((flag) => flag.message),
    channelReady:
      input.draft.channel === "email" ? transport.emailEnabled() : transport.smsEnabled(),
  };
}

export async function sendCampaignTest(input: {
  provider: DataProvider;
  workspaceId: string;
  draft: Pick<Campaign, "name" | "channel" | "subject" | "body">;
  /** Owner-supplied override; defaults to the signed-in owner's address. */
  destination?: string;
  baseUrl: string;
  transport?: CampaignTransport;
}): Promise<{ ok: boolean; note: string; missing?: string[] }> {
  const data = await input.provider.getData(input.workspaceId);
  if (!data) return { ok: false, note: "That workspace no longer exists." };

  const destination = (input.destination ?? "").trim() || data.owner.email;
  if (!destination) {
    return {
      ok: false,
      note:
        input.draft.channel === "email"
          ? "Add an email address to send the test to."
          : "Add a mobile number to send the test to.",
    };
  }

  return runCampaignTestSend({
    campaign: input.draft,
    destination,
    location: {
      name: data.location.name,
      timezone: data.location.timezone || data.workspace.timezone,
      address: data.location.address,
    },
    baseUrl: input.baseUrl,
    brand: data.workspace.whiteLabel?.brandName,
    transport: input.transport ?? liveTransport,
  });
}
