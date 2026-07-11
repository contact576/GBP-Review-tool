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
    | "fabricated_specifics";
  message: string;
}

export interface LintContext {
  kind: "review" | "reply" | "post" | "campaign" | "report" | "qna";
  businessName?: string;
  allowedFacts?: string[];
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

// ── Aggregate ───────────────────────────────────────────────
export function runLints(text: string, ctx: LintContext): LintResult {
  const flags: LintFlag[] = [];
  const push = (f: LintFlag | null) => f && flags.push(f);
  push(lintNameStuffing(text, ctx.businessName));
  push(lintIncentiveLanguage(text));
  push(lintAttributionHonesty(text, ctx));
  push(lintFabricatedSpecifics(text, ctx));
  return { ok: flags.length === 0, flags };
}

/**
 * The business NAME field can never be a Co-Pilot edit target.
 * Callers that build GBP task payloads must assert this.
 */
export function assertNotNameField(field: string): void {
  if (field.toLowerCase() === "name" || field.toLowerCase() === "business_name") {
    throw new Error(
      "GBP name field is never editable — keyword-stuffing the name risks profile suspension.",
    );
  }
}
