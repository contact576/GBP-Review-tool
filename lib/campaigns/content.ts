import { lintAttributionHonesty, lintIncentiveLanguage, lintNameStuffing, type LintFlag } from "@/lib/compliance/lints";

/**
 * Campaign copy gate.
 *
 * `lintIncentiveLanguage` already existed but was never wired to campaigns —
 * the one surface that can broadcast "leave us a review and get 10% off" to a
 * whole customer list. Offering anything of value for a review violates Google's
 * prohibited-content policy and the FTC's endorsement rules, and the profile,
 * not Foundly, takes the penalty. So incentive language BLOCKS the send.
 *
 * Keyword stuffing and over-claimed attribution are style problems, not
 * platform violations, so they warn and let the owner decide.
 */

export interface CampaignContentCheck {
  /** False when at least one blocking flag fired — the send must not proceed. */
  ok: boolean;
  blocking: LintFlag[];
  warnings: LintFlag[];
}

export function checkCampaignContent(input: {
  subject?: string;
  body: string;
  businessName?: string;
}): CampaignContentCheck {
  const text = [input.subject ?? "", input.body].filter(Boolean).join("\n");
  const blocking: LintFlag[] = [];
  const warnings: LintFlag[] = [];

  const incentive = lintIncentiveLanguage(text);
  if (incentive) blocking.push(incentive);

  const stuffing = lintNameStuffing(text, input.businessName);
  if (stuffing) warnings.push(stuffing);

  const attribution = lintAttributionHonesty(text, { kind: "campaign" });
  if (attribution) warnings.push(attribution);

  return { ok: blocking.length === 0, blocking, warnings };
}

/** One sentence naming every blocking flag, for a toast or a stored note. */
export function describeBlockingFlags(flags: LintFlag[]): string {
  if (flags.length === 0) return "";
  return `Blocked before sending — ${flags.map((flag) => flag.message).join(" ")}`;
}
