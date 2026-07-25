import { checkQuietHours } from "@/lib/compliance/quiet-hours";
import { marketingCampaignEmail, marketingCampaignSms } from "@/lib/email/templates";
import type { SendEmailInput, SendEmailResult } from "@/lib/email";
import { buildUnsubscribeUrl } from "./unsubscribe";
import { decideEligibility, personalize } from "./audience";
import { checkCampaignContent, describeBlockingFlags } from "./content";
import { estimateCampaignCredits } from "./credits";
import type {
  Campaign,
  CampaignAudienceSnapshot,
  CampaignDelivery,
  CampaignRecipient,
  Customer,
  SuppressionEntry,
  Subscription,
} from "@/lib/data/types";

/**
 * The campaign send pipeline.
 *
 * Everything that decides whether a message may leave lives here, transports
 * are injected, and nothing in this module talks to a database. That is what
 * makes "does an opted-out customer get an email?" a unit test rather than a
 * production incident.
 *
 * Gate order — each one stops the send before the next is even considered:
 *   1. content lint      (incentive language → hard block, Google policy)
 *   2. empty audience    (nothing to do)
 *   3. quiet hours       (SMS only, in the LOCATION's timezone → hold)
 *   4. provider keys     (missing → honest "not sent", never a fake success)
 *   5. credit allowance  (SMS only → block rather than overrun the plan)
 *   6. per-recipient consent re-check, then the actual send
 *
 * Step 6 exists because a scheduled campaign drains hours or days after its
 * snapshot was frozen. The snapshot is the historical record; the re-check is
 * what honours a withdrawal made in between.
 */

export interface SmsSendResult {
  ok: boolean;
  sid?: string;
  status?: string;
  error?: string;
}

/** Injected so tests never touch the network. */
export interface CampaignTransport {
  emailEnabled(): boolean;
  smsEnabled(): boolean;
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
  sendSms(input: { to: string; body: string; statusCallback: string }): Promise<
    { ok: true; sid: string; status: string } | { ok: false; error: string }
  >;
}

export interface CampaignSendContext {
  workspaceId: string;
  campaign: Pick<Campaign, "id" | "name" | "channel" | "subject" | "body" | "consentBasis">;
  snapshot: CampaignAudienceSnapshot;
  /** Live customer records, for the send-time consent re-check. */
  customers: Customer[];
  suppression: SuppressionEntry[];
  location: { name: string; timezone: string; address?: string };
  usage: Pick<Subscription["usage"], "smsCreditsUsed" | "smsCreditsTotal">;
  quietHoursEnabled: boolean;
  /** Absolute origin for unsubscribe + delivery-status callbacks. */
  baseUrl: string;
  brand?: string;
  now?: Date;
  transport: CampaignTransport;
}

export interface CampaignSendResult {
  delivery: CampaignDelivery;
  counts: { sent: number; failed: number; skipped: number; held: number };
  creditsUsed: number;
  /** The status the campaign row should move to. */
  status: Campaign["status"];
  /** True only when at least one real message was accepted by a provider. */
  didSend: boolean;
}

const MISSING_EMAIL_KEYS = ["RESEND_API_KEY"];
const MISSING_SMS_KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER",
];

function tally(recipients: CampaignRecipient[]): CampaignSendResult["counts"] {
  const counts = { sent: 0, failed: 0, skipped: 0, held: 0 };
  for (const recipient of recipients) {
    if (recipient.outcome === "sent") counts.sent += 1;
    else if (recipient.outcome === "failed") counts.failed += 1;
    else if (recipient.outcome === "held") counts.held += 1;
    else counts.skipped += 1;
  }
  return counts;
}

/** Stamp every recipient with the same non-send outcome and return the result. */
function terminate(
  context: CampaignSendContext,
  outcome: Exclude<CampaignRecipient["outcome"], "sent" | "pending">,
  delivery: Omit<CampaignDelivery, "snapshot">,
  status: Campaign["status"],
): CampaignSendResult {
  const attemptedAt = (context.now ?? new Date()).toISOString();
  const recipients = context.snapshot.recipients.map((recipient) => ({
    ...recipient,
    outcome,
    detail: delivery.note,
    attemptedAt,
  }));
  const snapshot: CampaignAudienceSnapshot = { ...context.snapshot, recipients };
  return {
    delivery: { ...delivery, attemptedAt, snapshot, creditsUsed: 0 },
    counts: tally(recipients),
    creditsUsed: 0,
    status,
    didSend: false,
  };
}

export async function runCampaignSend(
  context: CampaignSendContext,
): Promise<CampaignSendResult> {
  const now = context.now ?? new Date();
  const { campaign, transport } = context;
  const isSms = campaign.channel !== "email";

  // 1 ── Content. Incentivised reviews are a Google policy violation; the
  // penalty lands on the customer's profile, so this blocks rather than warns.
  const content = checkCampaignContent({
    subject: campaign.subject,
    body: campaign.body,
    businessName: context.location.name,
  });
  if (!content.ok) {
    return terminate(
      context,
      "skipped",
      { state: "blocked", note: describeBlockingFlags(content.blocking) },
      "draft",
    );
  }

  // 2 ── Nothing to send to.
  if (context.snapshot.recipients.length === 0) {
    return terminate(
      context,
      "skipped",
      {
        state: "blocked",
        note:
          context.snapshot.consentBasis === "marketing"
            ? "No customer has opted in to marketing, so this campaign has no one to go to."
            : "No customer has service consent, so this campaign has no one to go to.",
      },
      "draft",
    );
  }

  // 3 ── Quiet hours, in the RECIPIENT's local time (the location's zone).
  // Held, not failed: the cron retries it inside the window.
  if (isSms) {
    const quiet = checkQuietHours({
      enabled: context.quietHoursEnabled,
      timezone: context.location.timezone,
      at: now,
    });
    if (!quiet.allowed) {
      return terminate(context, "held", { state: "held", note: quiet.reason }, "scheduled");
    }
  }

  // 4 ── Provider keys. Ready-but-inactive: record the attempt, name what is
  // missing, and never report a send that did not happen.
  const configured = isSms ? transport.smsEnabled() : transport.emailEnabled();
  if (!configured) {
    const missing = isSms ? MISSING_SMS_KEYS : MISSING_EMAIL_KEYS;
    return terminate(
      context,
      "skipped",
      {
        state: "not_configured",
        note: isSms
          ? `Nothing was sent — SMS delivery is not connected. Add ${missing.join(", ")} to send this campaign.`
          : `Nothing was sent — email delivery is not connected. Add ${missing.join(", ")} to send this campaign.`,
        missing,
      },
      "draft",
    );
  }

  // 5 ── Credits. Refuse rather than overrun the plan's allowance.
  const estimate = estimateCampaignCredits({
    channel: campaign.channel,
    recipients: context.snapshot.recipients.length,
    body: campaign.body,
    usage: context.usage,
  });
  if (!estimate.withinAllowance) {
    return terminate(context, "skipped", { state: "blocked", note: estimate.message }, "draft");
  }

  // 6 ── Send, recipient by recipient, recording a real outcome for each.
  const customersById = new Map(context.customers.map((customer) => [customer.id, customer]));
  const attemptedAt = now.toISOString();
  const results: CampaignRecipient[] = [];
  let creditsUsed = 0;

  for (const recipient of context.snapshot.recipients) {
    const customer = customersById.get(recipient.customerId);
    // The snapshot is history; consent is live. A withdrawal made after the
    // snapshot was frozen still stops this message.
    const recheck = customer
      ? decideEligibility({
          customer,
          consentBasis: context.snapshot.consentBasis,
          channel: context.snapshot.channel,
          suppression: context.suppression,
        })
      : null;
    if (!recheck || !recheck.eligible) {
      results.push({
        ...recipient,
        outcome: "skipped",
        attemptedAt,
        detail: recheck
          ? `Skipped — ${recheck.reason.toLowerCase()} since this audience was captured.`
          : "Skipped — this customer record no longer exists.",
      });
      continue;
    }

    const personalized = personalize(campaign.body, recipient.name);

    if (!isSms) {
      const unsubscribeUrl = buildUnsubscribeUrl(context.baseUrl, {
        workspaceId: context.workspaceId,
        customerId: recipient.customerId,
        campaignId: campaign.id,
      });
      const message = marketingCampaignEmail({
        subject: campaign.subject?.trim() || campaign.name,
        body: personalized,
        unsubscribeUrl,
        business: context.location.name,
        postalAddress: context.location.address,
        brand: context.brand,
      });
      const sent = await transport.sendEmail({
        to: recipient.destination,
        subject: message.subject,
        html: message.html,
        text: message.text,
        listUnsubscribeUrl: unsubscribeUrl,
      });
      results.push({
        ...recipient,
        attemptedAt,
        outcome: sent.ok ? "sent" : "failed",
        providerId: sent.ok ? sent.id : undefined,
        detail: sent.ok
          ? undefined
          : sent.reason === "not_configured"
            ? "Email delivery is not connected."
            : (sent.detail ?? "The email provider rejected this message."),
      });
      continue;
    }

    const statusCallback = `${context.baseUrl}/api/webhooks/twilio/status?workspaceId=${encodeURIComponent(context.workspaceId)}&campaignId=${encodeURIComponent(campaign.id)}`;
    const sent = await transport.sendSms({
      to: recipient.destination,
      body: marketingCampaignSms({ body: personalized }),
      statusCallback,
    });
    if (sent.ok) creditsUsed += estimate.segmentsPerMessage;
    results.push({
      ...recipient,
      attemptedAt,
      outcome: sent.ok ? "sent" : "failed",
      providerId: sent.ok ? sent.sid : undefined,
      detail: sent.ok ? undefined : sent.error,
    });
  }

  const counts = tally(results);
  const snapshot: CampaignAudienceSnapshot = { ...context.snapshot, recipients: results };
  const state: CampaignDelivery["state"] =
    counts.sent === 0 ? "blocked" : counts.sent === results.length ? "delivered" : "partial";
  const note =
    counts.sent === 0
      ? `Nothing was delivered. ${counts.failed} failed and ${counts.skipped} were skipped.`
      : counts.sent === results.length
        ? `Delivered to all ${counts.sent} recipient${counts.sent === 1 ? "" : "s"}.`
        : `Delivered to ${counts.sent} of ${results.length}. ${counts.failed} failed, ${counts.skipped} skipped.`;

  return {
    delivery: { state, note, attemptedAt, snapshot, creditsUsed },
    counts,
    creditsUsed,
    status: counts.sent > 0 ? "sent" : "draft",
    didSend: counts.sent > 0,
  };
}

// ── Test send ───────────────────────────────────────────────

export interface TestSendContext {
  campaign: Pick<Campaign, "name" | "channel" | "subject" | "body">;
  /** The owner's own address or number — never a customer's. */
  destination: string;
  location: { name: string; timezone: string; address?: string };
  baseUrl: string;
  brand?: string;
  transport: CampaignTransport;
}

export type TestSendResult =
  | { ok: true; note: string }
  | { ok: false; note: string; missing?: string[] };

/**
 * Send one copy of the campaign to the owner. Deliberately separate from
 * `runCampaignSend`: it writes no snapshot, consumes no credits, and never
 * touches the campaign's counters, so a test can never be mistaken for a send.
 */
export async function runCampaignTestSend(context: TestSendContext): Promise<TestSendResult> {
  const { campaign, transport } = context;
  const isSms = campaign.channel !== "email";

  const content = checkCampaignContent({
    subject: campaign.subject,
    body: campaign.body,
    businessName: context.location.name,
  });
  if (!content.ok) {
    return { ok: false, note: describeBlockingFlags(content.blocking) };
  }

  if (isSms) {
    if (!transport.smsEnabled()) {
      return {
        ok: false,
        note: `No test text was sent — SMS delivery is not connected. Add ${MISSING_SMS_KEYS.join(", ")} first.`,
        missing: MISSING_SMS_KEYS,
      };
    }
    const sent = await transport.sendSms({
      to: context.destination,
      body: marketingCampaignSms({ body: campaign.body, isTest: true }),
      statusCallback: `${context.baseUrl}/api/webhooks/twilio/status?test=1`,
    });
    return sent.ok
      ? { ok: true, note: `Test text sent to ${context.destination}. It was not counted as a campaign send.` }
      : { ok: false, note: `The test text could not be sent — ${sent.error}` };
  }

  if (!transport.emailEnabled()) {
    return {
      ok: false,
      note: `No test email was sent — email delivery is not connected. Add ${MISSING_EMAIL_KEYS.join(", ")} first.`,
      missing: MISSING_EMAIL_KEYS,
    };
  }
  // A test uses a self-addressed unsubscribe link so the owner can click it
  // and see exactly what a customer sees, without a customer id in play.
  const unsubscribeUrl = new URL("/api/unsubscribe", context.baseUrl).toString();
  const message = marketingCampaignEmail({
    subject: campaign.subject?.trim() || campaign.name,
    body: campaign.body,
    unsubscribeUrl,
    business: context.location.name,
    postalAddress: context.location.address,
    brand: context.brand,
    isTest: true,
  });
  const sent = await transport.sendEmail({
    to: context.destination,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
  return sent.ok
    ? { ok: true, note: `Test email sent to ${context.destination}. It was not counted as a campaign send.` }
    : {
        ok: false,
        note:
          sent.reason === "not_configured"
            ? "No test email was sent — email delivery is not connected."
            : `The test email could not be sent — ${sent.detail ?? "the provider rejected it"}.`,
      };
}
