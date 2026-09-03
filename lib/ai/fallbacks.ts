import type { DraftVariant } from "@/lib/data/types";
import type { Industry } from "@/lib/industries";
import {
  getIndustry,
  industryForGoogleCategory,
  LEGACY_VERTICAL_MAP,
} from "@/lib/industries";
import { runLints } from "@/lib/compliance/lints";

/**
 * Deterministic template ENGINE — used when no ANTHROPIC_API_KEY is set and
 * as the guaranteed-safe replacement for any AI variant that fails lints.
 *
 * Every draft is composed from the industry catalog's phrase banks so the
 * register always matches the star rating (5★ delighted, 4★ measured), the
 * industry, the chosen attributes, the service, and the staff member. Output
 * is lint-clean by construction and verified with `runLints` before return.
 */

// ── Seeded, deterministic variety ───────────────────────────

/** FNV-1a — stable across runs, varies meaningfully across inputs. */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length]!;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Chips arrive Title-cased ("Great food") — weave them in lowercased. */
function lc(s: string): string {
  return s.trim().toLowerCase();
}

// ── Industry resolution ─────────────────────────────────────

/**
 * Resolve the industry for a review-generation input: explicit catalog key
 * first, then the legacy 7-value vertical map, then a best-effort match of
 * the free-text category, finally professional_services.
 */
export function resolveReviewIndustry(industryKey?: string, category?: string): Industry {
  if (industryKey && industryKey.trim().length > 0) {
    return getIndustry(LEGACY_VERTICAL_MAP[industryKey.trim().toLowerCase()] ?? industryKey.trim());
  }
  const cat = (category ?? "").trim().toLowerCase();
  if (cat.length > 0) {
    const legacy = LEGACY_VERTICAL_MAP[cat];
    if (legacy) return getIndustry(legacy);
    const matched = industryForGoogleCategory(cat);
    if (matched) return matched;
  }
  return getIndustry("professional_services");
}

// ── Review drafts ───────────────────────────────────────────

export interface ReviewDraftInput {
  business: string;
  /** Free-text category — kept for back-compat; industryKey wins. */
  category: string;
  rating: number;
  attributes: string[];
  staffName?: string;
  service?: string;
  /** Catalog industry key (preferred over category). */
  industryKey?: string;
  /**
   * Per-request uniqueness token (see `makeDraftNonce`). Without it two
   * customers who tap the same chips at the same business get byte-identical
   * template text — the repetition bug this field exists to kill.
   */
  nonce?: string;
}

interface Slots {
  biz: string;
  visit: string;
  role: string;
  attr1?: string;
  attr2?: string;
  svc?: string;
  staff?: string;
  exp: string;
  closer: string;
}

/** "great food and cozy atmosphere" | "great food" | fallback. */
function attrList(s: Slots, fallback: string): string {
  if (s.attr1 && s.attr2) return `${s.attr1} and ${s.attr2}`;
  return s.attr1 ?? fallback;
}

/** (a) Short and natural — 1-2 sentences. */
function composeShort(s: Slots, rating: number): string {
  const svcTail = s.svc ? ` for ${s.svc}` : "";
  if (rating >= 5) {
    return `Fantastic ${s.visit} at ${s.biz}${svcTail}. ${cap(attrList(s, "friendly, genuine service"))} — ${s.closer}.`;
  }
  return `Really good ${s.visit} at ${s.biz}${svcTail}. ${cap(attrList(s, "solid, honest service"))} — ${s.closer}.`;
}

/** (b) Detailed and specific — 3-4 sentences, mentions service + both attributes. */
function composeDetailed(s: Slots, rating: number): string {
  const opener = s.svc
    ? rating >= 5
      ? `Came in for ${s.svc} at ${s.biz} and the whole ${s.visit} was excellent.`
      : `Came in for ${s.svc} at ${s.biz} and had a really good experience.`
    : rating >= 5
      ? `My ${s.visit} at ${s.biz} was excellent from start to finish.`
      : `Had a really good experience at ${s.biz}.`;
  const staffLine = s.staff
    ? ` A big thank-you to ${s.staff}, the ${s.role} who took care of me.`
    : "";
  const highlight = ` What stood out: ${attrList(s, "how genuinely helpful everyone was")}.`;
  const closer =
    rating >= 5
      ? ` ${cap(s.closer)}.`
      : ` A couple of small things could be smoother, but overall ${s.closer}.`;
  return `${opener} ${cap(s.exp)}.${staffLine}${highlight}${closer}`;
}

/** (c) Warm and conversational — first-person storytelling opener. */
function composeWarm(s: Slots, rating: number): string {
  const opener =
    rating >= 5
      ? `Stopped in at ${s.biz}${s.svc ? ` for ${s.svc}` : ""} and I'm so glad I did.`
      : `Went in to ${s.biz}${s.svc ? ` for ${s.svc}` : ""} with high hopes, and it mostly delivered.`;
  const staffClause = s.staff
    ? `, and ${s.staff} (the ${s.role} who looked after me) made it easy`
    : "";
  const winner =
    rating >= 5
      ? ` What won me over: ${attrList(s, "how welcome they made me feel")}.`
      : ` What stood out: ${attrList(s, "how straightforward everything was")}.`;
  return `${opener} ${cap(s.exp)}${staffClause}.${winner} ${cap(s.closer)}.`;
}

/** "appointment" -> "an appointment", "visit" -> "a visit". */
function article(noun: string): string {
  return /^[aeiou]/i.test(noun.trim()) ? "an" : "a";
}

/** ≤3★ never gets promotional copy — one neutral, factual sentence. */
function composeNeutral(input: ReviewDraftInput, industry: Industry): DraftVariant[] {
  const svcTail = input.service ? ` for ${lc(input.service)}` : "";
  const visit = industry.terminology.visit;
  const text = `I had ${article(visit)} ${visit} at ${input.business}${svcTail}.`;
  return [
    { text, tone: "Short & natural" },
    { text: `I visited ${input.business}${svcTail}.`, tone: "Detailed & specific" },
    { text: `${cap(industry.terminology.visit)} at ${input.business}${svcTail}.`, tone: "Warm & conversational" },
  ];
}

const TEMPLATE_TONES = ["Short & natural", "Detailed & specific", "Warm & conversational"] as const;

export function fallbackReviewDrafts(input: ReviewDraftInput): DraftVariant[] {
  const industry = resolveReviewIndustry(input.industryKey, input.category);
  if (input.rating <= 3) return composeNeutral(input, industry);

  const rating = input.rating >= 5 ? 5 : 4;
  const expBank = rating === 5 ? industry.phrases.experience5 : industry.phrases.experience4;
  const closerBank = rating === 5 ? industry.phrases.closer5 : industry.phrases.closer4;
  // The nonce is what makes two customers with identical picks read differently.
  // Each phrase slot hashes its own key as well, so the experience clause and
  // the closer rotate independently instead of moving in lockstep.
  const seedBase = `${input.business}|${input.attributes.join(",")}|${rating}|${input.nonce ?? ""}`;
  const slotSeed = (slot: string, variantIndex: number): number =>
    hashSeed(`${seedBase}|${slot}|${variantIndex}`);

  const base: Omit<Slots, "exp" | "closer"> = {
    biz: input.business,
    visit: industry.terminology.visit,
    role: industry.terminology.staff,
    attr1: input.attributes[0] ? lc(input.attributes[0]) : undefined,
    attr2: input.attributes[1] ? lc(input.attributes[1]) : undefined,
    svc: input.service ? lc(input.service) : undefined,
    staff: input.staffName?.trim().split(/\s+/)[0],
  };

  const composers = [composeShort, composeDetailed, composeWarm];
  return composers.map((compose, i) => {
    // Structures use independently seeded phrase picks so the three variants
    // differ; a retry loop guarantees the lint invariant even for adversarial
    // names.
    let text = "";
    const expSeed = slotSeed("experience", i);
    const closerSeed = slotSeed("closer", i);
    for (let attempt = 0; attempt < expBank.length; attempt++) {
      const slots: Slots = {
        ...base,
        exp: pick(expBank, expSeed + attempt),
        closer: pick(closerBank, closerSeed + attempt),
      };
      text = compose(slots, rating);
      const res = runLints(text, {
        kind: "review",
        businessName: input.business,
        rating,
        allowedFacts: [...input.attributes, input.service ?? "", input.staffName ?? ""],
      });
      if (res.ok) break;
      // Last resort: a minimal draft that cannot trip any lint.
      if (attempt === expBank.length - 1) {
        text = compose({ ...base, exp: "the whole thing was handled with care", closer: rating === 5 ? "so glad I found them" : "would come back" }, rating);
      }
    }
    return { text, tone: TEMPLATE_TONES[i] ?? "Warm & conversational" };
  });
}

// ── Reply drafts ────────────────────────────────────────────

export interface ReplyDraftInput {
  reviewText: string;
  rating: number;
  business: string;
  author?: string;
}

export function fallbackReplyDrafts(input: ReplyDraftInput): DraftVariant[] {
  const name = input.author ? `, ${input.author.split(" ")[0]}` : "";
  if (input.rating >= 4) {
    return [
      { text: `Thank you so much${name}! We're thrilled you had a great experience with us — it genuinely makes our day. We look forward to seeing you again.`, tone: "warm" },
      { text: `We really appreciate you taking the time to share this${name}. Thank you for trusting ${input.business} — see you next time.`, tone: "professional" },
      { text: `Thanks${name} — this means a lot to the whole team!`, tone: "brief" },
    ];
  }
  if (input.rating <= 2) {
    // 1-2★: deeper apology + a direct ask to get in touch.
    return [
      { text: `We're truly sorry${name} — this is not the experience we want anyone to have, and we take it seriously. Please contact us directly so we can hear the full story and do everything we can to make it right.`, tone: "warm" },
      { text: `Thank you for telling us${name}. We clearly fell short, and we apologize. We'd like to speak with you directly — please reach out to the owner so we can address what happened properly.`, tone: "professional" },
      { text: `We're very sorry${name}. Please contact us directly — we want to make this right.`, tone: "brief" },
    ];
  }
  // 3★: thanks + an invitation to name the specific improvement.
  return [
    { text: `Thank you for the honest feedback${name} — a middle-of-the-road visit means we have work to do. If you're open to it, we'd love to hear the one thing that would have made your experience better.`, tone: "warm" },
    { text: `We appreciate you taking the time${name}. It sounds like parts of your visit were fine but something kept it from being great — please let us know what we could improve, and we'll act on it.`, tone: "professional" },
    { text: `Thanks for the feedback${name}. What's the one thing we could have done better? We're listening.`, tone: "brief" },
  ];
}

// ── Campaign / task / report / feedback (unchanged) ─────────

export function fallbackCampaignCopy(input: {
  type: string;
  business: string;
  goal: string;
  channel: string;
}): { subject: string; body: string } {
  const merge = "{first_name}";
  if (input.type === "winback") {
    return {
      subject: `We miss you at ${input.business}`,
      body: `Hi ${merge}, it's been a while since your last visit to ${input.business}. We'd love to see you again — book a time that works for you and we'll take great care of you.`,
    };
  }
  if (input.type === "reminder") {
    return {
      subject: `A quick reminder from ${input.business}`,
      body: `Hi ${merge}, this is a friendly reminder from ${input.business}. ${input.goal || "Let us know if we can help you book your next visit."}`,
    };
  }
  return {
    subject: `${input.goal || "A note"} from ${input.business}`,
    body: `Hi ${merge}, ${input.goal || "we have something to share with you"}. Reply anytime or book online — we'd love to see you.`,
  };
}

export function fallbackTaskCopy(input: {
  kind: string;
  business: string;
  context: string;
}): string {
  if (input.kind === "qna") {
    return input.context || `Q: What services do you offer? A: We offer a full range of care at ${input.business} — reach out and we'll point you to the right option.`;
  }
  return input.context || `An update from ${input.business}: we're here and ready to help. Book online or give us a call — we'd love to see you this week.`;
}

export function fallbackReportNarration(input: {
  business: string;
  foundYou: number;
  foundDelta: number;
  contactedYou: number;
  newReviews: number;
}): string {
  const trend = input.foundDelta >= 0 ? `up ${input.foundDelta}%` : `down ${Math.abs(input.foundDelta)}%`;
  return `This month, ${input.foundYou.toLocaleString()} people found ${input.business} on Google — ${trend} from the month before. ${input.contactedYou} people took an action to contact you, and ${input.newReviews} new reviews were detected. Your steady stream of fresh reviews is a big part of why more people are finding you. Keep the momentum going with this week's three tasks.`;
}

export function fallbackFeedbackSummary(items: string[]): { theme: string; action: string } {
  const joined = items.join(" ").toLowerCase();
  let theme = "General service feedback";
  let action = "Review each note and follow up personally where a contact was left.";
  if (joined.includes("wait") || joined.includes("rushed")) {
    theme = "Wait times and appointment pacing";
    action = "Consider buffer time between appointments and set clearer expectations at check-in.";
  } else if (joined.includes("park")) {
    theme = "Parking and wayfinding";
    action = "Add clear parking directions to your confirmation messages and a sign near the entrance.";
  } else if (joined.includes("price") || joined.includes("billing")) {
    theme = "Pricing and billing clarity";
    action = "Make billing and direct-billing details clearer up front to avoid surprises.";
  }
  return { theme, action };
}

// ── Free-score sample ───────────────────────────────────────

export type ScoreStanding = "strong" | "average" | "weak";

export interface ScoreSampleInput {
  business: string;
  category: string;
  /** Diagnosed profile band — drives the sample's register. */
  standing?: ScoreStanding;
  /** Optional star rating used to derive standing when absent. */
  rating?: number;
}

/** Standing from explicit band, else rating, else optimistic default. */
export function normalizeStanding(input: Pick<ScoreSampleInput, "standing" | "rating">): ScoreStanding {
  if (input.standing) return input.standing;
  if (typeof input.rating === "number") {
    if (input.rating >= 4.5) return "strong";
    if (input.rating >= 3.5) return "average";
    return "weak";
  }
  return "strong";
}

/** The star count a sample of this standing should display. */
export function starsForStanding(standing: ScoreStanding): 4 | 5 {
  return standing === "strong" ? 5 : 4;
}

export function fallbackScoreSample(input: ScoreSampleInput): string {
  const standing = normalizeStanding(input);
  const industry = resolveReviewIndustry(undefined, input.category);
  const { visit } = industry.terminology;
  const seed = hashSeed(`${input.business}|${input.category}|${standing}`);
  const exp5 = (n: number) => pick(industry.phrases.experience5, seed + n);
  const exp4 = (n: number) => pick(industry.phrases.experience4, seed + n);
  const closer5 = (n: number) => pick(industry.phrases.closer5, seed + n);
  const closer4 = (n: number) => pick(industry.phrases.closer4, seed + n);
  const biz = input.business;

  let samples: string[];
  if (standing === "strong") {
    // Confident, delighted 5★ register.
    samples = [
      `${cap(exp5(0))}. ${biz} made the whole ${visit} easy from start to finish — ${closer5(0)}.`,
      `Couldn't have asked for a better ${visit} at ${biz}. ${cap(exp5(1))}, and ${closer5(1)}.`,
      `${biz} is the real deal. ${cap(exp5(2))} — ${closer5(2)}.`,
    ];
  } else if (standing === "average") {
    // Warm 4★ register — positive, no superlatives.
    samples = [
      `Had a really good ${visit} at ${biz}. ${cap(exp4(0))} — ${closer4(0)}.`,
      `${cap(exp4(1))}. ${biz} did a solid job overall, and ${closer4(1)}.`,
      `Good experience with ${biz}. ${cap(exp4(2))}, and ${closer4(2)}.`,
    ];
  } else {
    // Weak: hopeful-but-measured 4★ — still positive, clearly grounded.
    samples = [
      `${biz} is clearly working on getting the details right. ${cap(exp4(0))}, and ${closer4(0)}.`,
      `My ${visit} at ${biz} went better than expected — ${exp4(1)}. ${cap(closer4(1))}.`,
      `Solid ${visit} at ${biz}. ${cap(exp4(2))} — you can tell they care, and ${closer4(2)}.`,
    ];
  }
  return pick(samples, seed >> 4);
}
