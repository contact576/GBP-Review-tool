import { canSendMarketing, canSendService } from "@/lib/compliance/consent";
import { canonicalPhone, isE164 } from "@/lib/sms/phone";
import type {
  CampaignAudienceSnapshot,
  CampaignRecipient,
  Channel,
  Customer,
  SuppressionEntry,
} from "@/lib/data/types";

/**
 * Campaign audience resolution.
 *
 * This is the single gate between "a saved draft" and "a message that leaves
 * the building". It is pure and synchronous on purpose: the consent decision
 * must be unit-testable without a database, a network, or a session.
 *
 * The order below is the legal order, and every excluded customer is counted
 * under exactly ONE reason so the excluded totals always reconcile:
 *   1. consent for the stated basis (marketing ≠ service — neither implies the other)
 *   2. an explicit withdrawal
 *   3. a per-customer suppression
 *   4. a workspace-wide do-not-contact entry (STOP replies, hard bounces)
 *   5. a usable destination for the chosen channel
 */

export const EXCLUSION_REASONS = {
  noMarketingConsent: "Not opted in to marketing",
  noServiceConsent: "No service consent",
  withdrawn: "Consent withdrawn",
  suppressed: "Suppressed",
  globalOptOut: "On the do-not-contact list",
  noEmail: "No email address",
  noPhone: "No mobile number",
  badPhone: "Phone number is not in E.164 format",
} as const;

export type ExclusionReason = (typeof EXCLUSION_REASONS)[keyof typeof EXCLUSION_REASONS];

export interface EligibilityInput {
  customer: Customer;
  consentBasis: "service" | "marketing";
  channel: Channel;
  suppression: SuppressionEntry[];
}

export type EligibilityDecision =
  | { eligible: true; destination: string }
  | { eligible: false; reason: ExclusionReason };

/**
 * Phone comparison for suppression only.
 *
 * Deliberately looser than `canonicalPhone` equality: a STOP reply may be
 * recorded as "4155550199" while the customer record holds "+1 415-555-0199".
 * Treating those as different people would keep texting someone who opted out,
 * so the last ten digits are compared when both sides have them. This errs
 * toward suppressing, which is the only safe direction to err in.
 */
function phoneMatches(left: string | undefined, right: string | undefined): boolean {
  const a = (left ?? "").replace(/\D/g, "");
  const b = (right ?? "").replace(/\D/g, "");
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 10 && b.length >= 10 && a.slice(-10) === b.slice(-10);
}

/** True when a workspace-wide suppression entry covers this customer. */
export function isGloballySuppressed(
  customer: Pick<Customer, "email" | "phone">,
  suppression: SuppressionEntry[],
): boolean {
  const email = customer.email?.trim().toLowerCase() ?? "";
  const domain = email.includes("@") ? (email.split("@")[1] ?? "") : "";
  return suppression.some((entry) => {
    const value = entry.value.trim().toLowerCase();
    if (entry.matchType === "email") return Boolean(email) && value === email;
    if (entry.matchType === "domain") return Boolean(domain) && value.replace(/^@/, "") === domain;
    if (entry.matchType === "phone") return phoneMatches(customer.phone, entry.value);
    return false;
  });
}

/**
 * Decide whether one customer may receive one campaign message right now.
 * Also used at drain time to re-verify a snapshotted recipient, so a
 * withdrawal made after scheduling still stops the message.
 */
export function decideEligibility(input: EligibilityInput): EligibilityDecision {
  const { customer, consentBasis, channel, suppression } = input;

  const consented =
    consentBasis === "marketing" ? canSendMarketing(customer) : canSendService(customer);
  if (!consented) {
    // Distinguish "never opted in" from "opted in then withdrew" — the second
    // is a withdrawal we must be able to prove we honoured.
    const hadConsent =
      consentBasis === "marketing"
        ? customer.consent.marketingConsent
        : customer.consent.serviceConsent;
    if (hadConsent && customer.consent.withdrawnAt) {
      return { eligible: false, reason: EXCLUSION_REASONS.withdrawn };
    }
    return {
      eligible: false,
      reason:
        consentBasis === "marketing"
          ? EXCLUSION_REASONS.noMarketingConsent
          : EXCLUSION_REASONS.noServiceConsent,
    };
  }

  if (customer.suppressedReason) {
    return { eligible: false, reason: EXCLUSION_REASONS.suppressed };
  }
  if (isGloballySuppressed(customer, suppression)) {
    return { eligible: false, reason: EXCLUSION_REASONS.globalOptOut };
  }

  if (channel === "email") {
    const email = customer.email?.trim();
    if (!email) return { eligible: false, reason: EXCLUSION_REASONS.noEmail };
    return { eligible: true, destination: email };
  }

  const phone = customer.phone?.trim();
  if (!phone) return { eligible: false, reason: EXCLUSION_REASONS.noPhone };
  if (!isE164(phone)) return { eligible: false, reason: EXCLUSION_REASONS.badPhone };
  return { eligible: true, destination: canonicalPhone(phone) };
}

export interface AudienceInput {
  customers: Customer[];
  suppression: SuppressionEntry[];
  consentBasis: "service" | "marketing";
  channel: Channel;
  /** Snapshot timestamp. Injected so tests are deterministic. */
  now?: Date;
}

/**
 * Freeze the audience for a send. The returned object is the campaign's
 * permanent record of who was contactable at `takenAt`.
 */
export function buildAudienceSnapshot(input: AudienceInput): CampaignAudienceSnapshot {
  const takenAt = (input.now ?? new Date()).toISOString();
  const recipients: CampaignRecipient[] = [];
  const excludedCounts = new Map<string, number>();

  for (const customer of input.customers) {
    const decision = decideEligibility({
      customer,
      consentBasis: input.consentBasis,
      channel: input.channel,
      suppression: input.suppression,
    });
    if (decision.eligible) {
      recipients.push({
        customerId: customer.id,
        name: customer.name,
        channel: input.channel,
        destination: decision.destination,
        outcome: "pending",
      });
    } else {
      excludedCounts.set(decision.reason, (excludedCounts.get(decision.reason) ?? 0) + 1);
    }
  }

  // Stable, legally-ordered exclusion list — biggest gate first.
  const order: string[] = [
    EXCLUSION_REASONS.noMarketingConsent,
    EXCLUSION_REASONS.noServiceConsent,
    EXCLUSION_REASONS.withdrawn,
    EXCLUSION_REASONS.suppressed,
    EXCLUSION_REASONS.globalOptOut,
    EXCLUSION_REASONS.noEmail,
    EXCLUSION_REASONS.noPhone,
    EXCLUSION_REASONS.badPhone,
  ];
  const excluded = order
    .map((reason) => ({ reason, count: excludedCounts.get(reason) ?? 0 }))
    .filter((entry) => entry.count > 0);

  return {
    takenAt,
    consentBasis: input.consentBasis,
    channel: input.channel,
    total: input.customers.length,
    eligible: recipients.length,
    excluded,
    recipients,
  };
}

/** Substitute the personalisation tokens the composer advertises. */
export function personalize(template: string, customerName: string): string {
  const first = customerName.trim().split(/\s+/)[0] || "there";
  return template
    .replace(/\{first_name\}/g, first)
    .replace(/\{name\}/g, customerName.trim() || first);
}
