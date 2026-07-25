/**
 * Compliance lints — the hard backstop run on EVERY generated string
 * (AI or template), before it can be saved or shown as "ready".
 * A failed lint blocks/sanitizes the surface; it never merely warns.
 */

export interface LintFlag {
  code:
    | "name_stuffing"
    | "incentive_language"
    | "attribution_dishonesty"
    | "fabricated_specifics"
    | "sentiment_mismatch";
  message: string;
}

export interface LintContext {
  kind: "review" | "reply" | "post" | "campaign" | "report" | "qna";
  businessName?: string;
  allowedFacts?: string[];
  /** Star rating the text claims to represent (reviews only). */
  rating?: number;
}

export interface LintResult {
  ok: boolean;
  flags: LintFlag[];
}

// ── Individual lints ────────────────────────────────────────

/** Flag ≥2 repetitions of the business name or category keyword. */
export function lintNameStuffing(text: string, businessName?: string): LintFlag | null {
  if (!businessName) return null;
  const words = businessName
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .map((w) => w.toLowerCase());
  const lower = text.toLowerCase();
  for (const w of words) {
    const occurrences = lower.split(w).length - 1;
    if (occurrences >= 3) {
      return {
        code: "name_stuffing",
        message: `"${w}" repeated ${occurrences}× — reads as keyword stuffing.`,
      };
    }
  }
  return null;
}

const INCENTIVE_TERMS = [
  "discount", "coupon", "gift card", "gift-card", "voucher", "reward",
  "free ", "% off", "percent off", "in exchange", "raffle", "entry", "giveaway",
  "prize", "cash back", "cashback", "store credit",
];

/** Block incentive-for-review phrasing (Google policy + FTC). */
export function lintIncentiveLanguage(text: string): LintFlag | null {
  const lower = text.toLowerCase();
  const mentionsReview = /\breview(s)?\b/.test(lower);
  if (!mentionsReview) return null;
  for (const term of INCENTIVE_TERMS) {
    if (lower.includes(term)) {
      return {
        code: "incentive_language",
        message: `Incentive term "${term.trim()}" near "review" — incentivized reviews violate Google policy.`,
      };
    }
  }
  return null;
}

const DISHONEST_TERMS = [
  "customers gained", "new customers", "customers won", "revenue generated",
  "guaranteed", "impressions", "click-through rate", "ctr", "serp",
  "conversions", "roi of",
];

/** Block "customers gained"/revenue/SEO-jargon in narratives (honesty law). */
export function lintAttributionHonesty(text: string, ctx: LintContext): LintFlag | null {
  if (ctx.kind !== "report" && ctx.kind !== "campaign" && ctx.kind !== "post") return null;
  const lower = text.toLowerCase();
  for (const term of DISHONEST_TERMS) {
    if (lower.includes(term)) {
      return {
        code: "attribution_dishonesty",
        message: `"${term}" over-claims attribution — show actions (found/contacted), not customers/revenue.`,
      };
    }
  }
  return null;
}

/** Flag invented dollar amounts or dates not present in the allowed facts. */
export function lintFabricatedSpecifics(text: string, ctx: LintContext): LintFlag | null {
  if (ctx.kind !== "review") return null;
  const allowed = (ctx.allowedFacts ?? []).join(" ").toLowerCase();
  const dollarMatch = text.match(/\$\d+/);
  if (dollarMatch && !allowed.includes(dollarMatch[0].toLowerCase())) {
    return {
      code: "fabricated_specifics",
      message: `Invented amount "${dollarMatch[0]}" the customer didn't supply.`,
    };
  }
  return null;
}

/**
 * Superlatives only believable in a genuine 5-star review. A 4-star review
 * using these reads as inflated; at ≤3 stars ANY strong positive is a
 * mismatch (the flow should never draft promotional text for ≤3 anyway).
 */
const FIVE_STAR_ONLY_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /exceeded expectations/i, label: "exceeded expectations" },
  { re: /flawless/i, label: "flawless" },
  { re: /perfect/i, label: "perfect" },
  { re: /\bbest\b.*\bever\b/i, label: "best … ever" },
  { re: /incredible/i, label: "incredible" },
  { re: /10\s*\/\s*10/i, label: "10/10" },
];

/** Any strong-positive superlative — banned outright when rating ≤ 3. */
const STRONG_POSITIVE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /exceeded/i, label: "exceeded" },
  { re: /flawless/i, label: "flawless" },
  { re: /perfect/i, label: "perfect" },
  { re: /amazing/i, label: "amazing" },
  { re: /incredible/i, label: "incredible" },
  { re: /outstanding/i, label: "outstanding" },
  { re: /\bbest\b.*\bever\b/i, label: "best … ever" },
  { re: /highly recommend/i, label: "highly recommend" },
  { re: /10\s*\/\s*10/i, label: "10/10" },
  { re: /five stars/i, label: "five stars" },
];

/**
 * Sentiment must match the star rating the text claims to represent:
 *  - rating ≤ 3 → flag ANY strong-positive superlative.
 *  - rating 4   → flag 5★-only superlatives; warm-positive language
 *                 ("great", "really good", "recommend") is allowed.
 *  - rating 5   → no flag.
 */
export function lintSentimentConsistency(text: string, rating: number): LintFlag | null {
  if (rating >= 5) return null;
  const bank = rating <= 3 ? STRONG_POSITIVE_PATTERNS : FIVE_STAR_ONLY_PATTERNS;
  for (const { re, label } of bank) {
    if (re.test(text)) {
      return {
        code: "sentiment_mismatch",
        message: `"${label}" reads as ${rating <= 3 ? "glowing praise" : "5-star hype"} in a ${rating}-star review — tone must match the rating.`,
      };
    }
  }
  return null;
}

// ── Aggregate ───────────────────────────────────────────────
export function runLints(text: string, ctx: LintContext): LintResult {
  const flags: LintFlag[] = [];
  const push = (f: LintFlag | null) => f && flags.push(f);
  push(lintNameStuffing(text, ctx.businessName));
  push(lintIncentiveLanguage(text));
  push(lintAttributionHonesty(text, ctx));
  push(lintFabricatedSpecifics(text, ctx));
  if (ctx.kind === "review" && typeof ctx.rating === "number") {
    push(lintSentimentConsistency(text, ctx.rating));
  }
  return { ok: flags.length === 0, flags };
}

// ── Business-name protection (hard block, never a warning) ──

/**
 * The one message shown whenever an automated change tries to touch the
 * Google business name. Plain language, and it says what to do instead.
 */
export const NAME_EDIT_BLOCKED_MESSAGE =
  "The Google business name is never changed automatically. Google requires the name to match the real-world name on your signage, and adding keywords to it can get the profile suspended. If the name on Google is wrong, please correct it yourself in Google Business Profile.";

/** Compare field identifiers without punctuation or casing noise. */
function normalizeFieldKey(field: string): string {
  return field.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Every identifier that resolves to the Google business name (`location.title`).
 * Targets, field names and update-mask paths are all checked against this.
 */
const NAME_FIELD_IDENTIFIERS = new Set([
  "name",
  "businessname",
  "businesstitle",
  "title",
  "locationtitle",
  "profiletitle",
  "displaytitle",
]);

/**
 * Payload keys that would write the name. Deliberately narrower than
 * `NAME_FIELD_IDENTIFIERS`: Google uses a bare `name` key as the resource id on
 * categories and attributes, so only title-shaped keys count here.
 */
const NAME_PAYLOAD_KEYS = new Set([
  "title",
  "businesstitle",
  "businessname",
  "locationtitle",
  "profiletitle",
]);

/** True when this field/target/update-mask path resolves to the business name. */
export function isNameField(field: string): boolean {
  const segments = field.split(/[./]/).filter(Boolean);
  const candidates = [field, ...segments].map(normalizeFieldKey);
  return candidates.some((candidate) => NAME_FIELD_IDENTIFIERS.has(candidate));
}

/**
 * The business NAME field can never be a Co-Pilot edit target.
 * Callers that build GBP task payloads must assert this.
 */
export function assertNotNameField(field: string): void {
  if (isNameField(field)) {
    throw new Error(NAME_EDIT_BLOCKED_MESSAGE);
  }
}

/**
 * Backstop for the same rule at the payload level: a name change smuggled
 * inside another target's body (nested or not) is rejected the same way.
 */
export function assertPayloadWritesNoNameField(payload: unknown): void {
  walkForNameWrite(payload, new Set<object>());
}

function walkForNameWrite(value: unknown, seen: Set<object>): void {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) walkForNameWrite(entry, seen);
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (NAME_PAYLOAD_KEYS.has(normalizeFieldKey(key))) {
      throw new Error(NAME_EDIT_BLOCKED_MESSAGE);
    }
    walkForNameWrite(entry, seen);
  }
}
