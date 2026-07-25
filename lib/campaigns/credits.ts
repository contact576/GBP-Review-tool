import type { Channel, Subscription } from "@/lib/data/types";

/**
 * SMS credit estimation.
 *
 * A campaign is the one place in the product that can burn a month's SMS
 * allowance in a single click, so the cost is shown BEFORE the send and the
 * send is refused if it would overrun. Twilio bills per segment, not per
 * message, so a 200-character body costs two credits per recipient — quoting
 * "one credit each" would understate the bill.
 *
 * Email costs no credits; Resend is not metered by this plan model.
 */

/** GSM-7 single-part limit. */
const SEGMENT_SINGLE = 160;
/** Concatenated parts lose 7 characters to the UDH header. */
const SEGMENT_MULTI = 153;
/** Unicode (emoji/accents) drops the same messages to UCS-2 sizing. */
const UNICODE_SINGLE = 70;
const UNICODE_MULTI = 67;

const GSM7 =
  "@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà\n\r\f";
const GSM7_EXTENDED = "^{}\\[~]|€";

function isGsm7(text: string): boolean {
  for (const char of text) {
    if (!GSM7.includes(char) && !GSM7_EXTENDED.includes(char)) return false;
  }
  return true;
}

/** Billable Twilio segments for one message body. */
export function smsSegments(body: string): number {
  const text = body ?? "";
  if (text.length === 0) return 1;
  const extended = isGsm7(text)
    ? [...text].filter((char) => GSM7_EXTENDED.includes(char)).length
    : 0;
  const unicode = !isGsm7(text);
  const length = text.length + extended;
  const single = unicode ? UNICODE_SINGLE : SEGMENT_SINGLE;
  const multi = unicode ? UNICODE_MULTI : SEGMENT_MULTI;
  if (length <= single) return 1;
  return Math.ceil(length / multi);
}

export interface CreditEstimate {
  channel: Channel;
  recipients: number;
  /** Billable segments in one copy of the message (SMS only; 0 for email). */
  segmentsPerMessage: number;
  creditsRequired: number;
  creditsRemaining: number;
  /** `smsCreditsTotal < 0` means the plan does not cap SMS. */
  unlimited: boolean;
  withinAllowance: boolean;
  /** Owner-facing sentence, safe to render verbatim. */
  message: string;
}

export function estimateCampaignCredits(input: {
  channel: Channel;
  recipients: number;
  body: string;
  usage: Pick<Subscription["usage"], "smsCreditsUsed" | "smsCreditsTotal">;
}): CreditEstimate {
  const { smsCreditsUsed, smsCreditsTotal } = input.usage;
  const unlimited = smsCreditsTotal < 0;
  const remaining = unlimited ? Number.POSITIVE_INFINITY : Math.max(0, smsCreditsTotal - smsCreditsUsed);

  if (input.channel === "email") {
    return {
      channel: input.channel,
      recipients: input.recipients,
      segmentsPerMessage: 0,
      creditsRequired: 0,
      creditsRemaining: unlimited ? -1 : remaining,
      unlimited,
      withinAllowance: true,
      message: `${input.recipients} email${input.recipients === 1 ? "" : "s"} — email does not use SMS credits.`,
    };
  }

  const segments = smsSegments(input.body);
  const required = segments * input.recipients;
  const withinAllowance = unlimited || required <= remaining;

  const cost = `${required} SMS credit${required === 1 ? "" : "s"} (${segments} segment${segments === 1 ? "" : "s"} × ${input.recipients} recipient${input.recipients === 1 ? "" : "s"})`;
  const message = unlimited
    ? `This send costs ${cost}. Your plan does not cap SMS credits.`
    : withinAllowance
      ? `This send costs ${cost}. You have ${remaining} left this cycle.`
      : `This send needs ${cost} but only ${remaining} remain${remaining === 1 ? "s" : ""} this cycle. Shorten the message, reduce the audience, or add credits before sending.`;

  return {
    channel: input.channel,
    recipients: input.recipients,
    segmentsPerMessage: segments,
    creditsRequired: required,
    creditsRemaining: unlimited ? -1 : remaining,
    unlimited,
    withinAllowance,
    message,
  };
}
