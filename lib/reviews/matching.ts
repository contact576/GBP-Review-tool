import type { Review, ReviewRequest } from "@/lib/data/types";

/**
 * Review ↔ request matching — "which review request probably produced this
 * Google review?".
 *
 * ── HONESTY LAW ──────────────────────────────────────────────────────────────
 * Google never tells us who posted a review in response to which request. There
 * is no join key. Everything below is INFERENCE from name, timing and how far
 * the customer got through the request. It supports the product's existing
 * language — "Detected — likely matched by name and time, not exact" — and
 * nothing stronger. Concretely:
 *   - confidence is capped at MAX_CONFIDENCE (< 1.0): we never output certainty;
 *   - a match is only written above MATCH_THRESHOLD, and when two requests are
 *     nearly tied we write NOTHING rather than guess between two customers;
 *   - an anonymous reviewer ("A Google user") is never attributed to anybody;
 *   - a test request can never claim a real review;
 *   - a match means "this review looks like it came from that request", never
 *     "this customer was gained" or "confirmed".
 *
 * ── THE CONFIDENCE FORMULA ───────────────────────────────────────────────────
 *   confidence = 0.55·name + 0.30·timing + 0.15·engagement,  capped at 0.95
 *
 *   name        fuzzy similarity between the review author and the customer on
 *               the request, handling initials, abbreviations, apostrophes and
 *               accents ("Dan O'B." vs "Daniel O'Brien" → 0.85).
 *   timing      how soon after the request was sent the review appeared.
 *   engagement  how far the customer actually got: posted > clicked > opened >
 *               delivered > sent.
 *
 * Any of the three can veto the whole match outright (a review published before
 * the request was sent, a request that was never sent, a nameless reviewer),
 * because a strong score on two signals must not paper over an impossibility on
 * the third.
 */

export const MATCH_WEIGHTS = { name: 0.55, timing: 0.3, engagement: 0.15 } as const;

/** Minimum confidence to store `matchedRequestId` at all. */
export const MATCH_THRESHOLD = 0.62;
/** Higher bar before we advance the request itself to its posted state. */
export const POSTED_THRESHOLD = 0.75;
/** Hard ceiling — attribution is inference, so the number is never 1.0. */
export const MAX_CONFIDENCE = 0.95;
/** Timing alone must never produce a match. */
export const MIN_NAME_SCORE = 0.5;
/** Two rival requests this close are indistinguishable → no match is written. */
export const AMBIGUITY_MARGIN = 0.08;
/** Beyond this, "they posted because of our request" stops being credible. */
export const MAX_WINDOW_DAYS = 45;
/** Clock-skew tolerance for a review timestamped just before the send. */
const BACKDATE_SLACK_HOURS = 6;

/** The formula, in one line, for tooltips and docs. */
export const MATCH_CONFIDENCE_RULE =
  "Confidence = 0.55 x name similarity + 0.30 x how soon after the request the review appeared + 0.15 x how far the customer got through the request, capped at 0.95 because this is a likely match, never a confirmed one.";

export interface ReviewMatch {
  reviewId: string;
  requestId: string;
  /** 0..MAX_CONFIDENCE. */
  confidence: number;
  nameScore: number;
  timingScore: number;
  engagementScore: number;
  /** Plain-language evidence, safe to surface to a business owner. */
  reasons: string[];
}

export interface ReviewMatchOutcome {
  /** Matches confident and unambiguous enough to store. */
  matches: ReviewMatch[];
  /** Best-effort scores that did NOT clear the bar, for debugging/telemetry. */
  rejected: ReviewMatch[];
  /** Review ids with two credible rivals — deliberately left unattributed. */
  ambiguous: string[];
}

const REQUEST_ENGAGEMENT: Partial<Record<ReviewRequest["status"], number>> = {
  posted_google: 1,
  clicked: 0.9,
  opened: 0.55,
  delivered: 0.3,
  sent: 0.25,
  // Routed to private feedback instead of Google. They *could* still post
  // publicly later, so this is weak evidence rather than a veto.
  private_feedback: 0.15,
};

/**
 * Statuses that make attribution impossible: the request either never reached
 * the customer or was explicitly stopped, so it cannot have caused a review.
 */
const DISQUALIFYING_STATUSES = new Set<ReviewRequest["status"]>([
  "queued",
  "failed",
  "suppressed",
]);

/**
 * Names Google substitutes when a reviewer has no display name. These carry no
 * identifying information, so they must never be attributed to a customer.
 */
const ANONYMOUS_AUTHORS = new Set(["a google user", "google user", "anonymous"]);

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "sir"]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

/**
 * Normalize a display name into comparable tokens:
 * strip accents, drop apostrophes so "O'Brien" → "obrien" and "O'B." → "ob",
 * remove honorifics and suffixes, lowercase everything.
 */
export function normalizeName(raw: string): string[] {
  const flattened = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!flattened) return [];
  return flattened
    .split(" ")
    .filter((token) => token.length > 0 && !HONORIFICS.has(token) && !SUFFIXES.has(token));
}

export function isAnonymousAuthor(raw: string): boolean {
  const normalized = normalizeName(raw).join(" ");
  return normalized.length === 0 || ANONYMOUS_AUTHORS.has(normalized);
}

/** Levenshtein distance — small inputs (name tokens) only. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    const aChar = a[i - 1];
    for (let j = 1; j <= b.length; j += 1) {
      const bChar = b[j - 1];
      const substitution = (previous[j - 1] ?? 0) + (aChar === bChar ? 0 : 1);
      const deletion = (previous[j] ?? 0) + 1;
      const insertion = (current[j - 1] ?? 0) + 1;
      current[j] = Math.min(substitution, deletion, insertion);
    }
    previous = current;
  }
  return previous[b.length] ?? Math.max(a.length, b.length);
}

/**
 * Similarity of one name token to another, 0..1.
 *
 * Deliberately generous about abbreviation (that is how people sign reviews)
 * and strict about everything else — two different names must score near zero,
 * not "somewhat similar because both are short".
 */
export function tokenSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.startsWith(short)) {
    if (short.length === 1) return 0.55; // bare initial: "D." vs "Daniel"
    if (short.length === 2) return 0.8; // abbreviation: "O'B." vs "O'Brien"
    return 0.9; // nickname/short form: "Dan" vs "Daniel"
  }
  const ratio = 1 - editDistance(a, b) / long.length;
  if (ratio >= 0.75) return ratio; // typo or spelling variant
  if (ratio >= 0.6) return ratio * 0.7; // weak; will not clear MIN_NAME_SCORE alone
  return 0;
}

function combineParts(given: number, family: number): number {
  return 0.5 * given + 0.5 * family;
}

/**
 * Fuzzy similarity between a review author and a customer name, 0..1.
 * Returns 0 for anonymous reviewers so they can never be attributed.
 */
export function nameSimilarity(author: string, customerName: string): number {
  if (isAnonymousAuthor(author)) return 0;
  const a = normalizeName(author);
  const b = normalizeName(customerName);
  const aFirst = a[0];
  const bFirst = b[0];
  if (!aFirst || !bFirst) return 0;

  const aLast = a.length > 1 ? a[a.length - 1] : undefined;
  const bLast = b.length > 1 ? b[b.length - 1] : undefined;

  // One side gave only a single name: real but weaker evidence.
  if (!aLast || !bLast) {
    const other = aLast ?? bLast;
    const single = aLast ? b : a;
    const singleToken = single[0] ?? "";
    const best = Math.max(
      tokenSimilarity(aFirst, bFirst),
      // "Chen" alone against "Michael Chen" should still count.
      other ? tokenSimilarity(singleToken, other) : 0,
    );
    return 0.65 * best;
  }

  const ordered = combineParts(tokenSimilarity(aFirst, bFirst), tokenSimilarity(aLast, bLast));
  // Some locales (and some CRM imports) put the family name first.
  const swapped =
    0.95 * combineParts(tokenSimilarity(aFirst, bLast), tokenSimilarity(aLast, bFirst));
  return Math.max(ordered, swapped);
}

/**
 * How strongly the gap between "request sent" and "review published" supports
 * attribution. `null` means the pair is impossible and must be discarded.
 */
export function timingScore(
  requestAnchorIso: string | undefined,
  publishedAtIso: string,
): { score: number; days: number } | null {
  if (!requestAnchorIso) return null;
  const anchor = new Date(requestAnchorIso).getTime();
  const published = new Date(publishedAtIso).getTime();
  if (!Number.isFinite(anchor) || !Number.isFinite(published)) return null;
  const hours = (published - anchor) / 3_600_000;
  // The review predates the request by more than clock skew allows — it cannot
  // have been caused by it, no matter how well the name matches.
  if (hours < -BACKDATE_SLACK_HOURS) return null;
  const days = Math.max(0, hours / 24);
  if (days > MAX_WINDOW_DAYS) return null;
  const score =
    days <= 3 ? 1 : days <= 7 ? 0.8 : days <= 14 ? 0.55 : days <= 30 ? 0.3 : 0.12;
  return { score, days };
}

function requestAnchor(request: ReviewRequest): string | undefined {
  return request.sentAt ?? request.createdAt;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function describeGap(days: number): string {
  if (days < 1) return "the same day the request was sent";
  const whole = Math.round(days);
  return `${whole} day${whole === 1 ? "" : "s"} after the request was sent`;
}

/** Score a single review/request pair. `null` when the pair is impossible. */
export function scorePair(review: Review, request: ReviewRequest): ReviewMatch | null {
  // A test request must never be able to claim credit for a real review.
  if (request.isTest) return null;
  if (DISQUALIFYING_STATUSES.has(request.status)) return null;
  const engagementScore = REQUEST_ENGAGEMENT[request.status];
  if (engagementScore === undefined) return null;

  const timing = timingScore(requestAnchor(request), review.publishedAt);
  if (!timing) return null;

  const name = nameSimilarity(review.author, request.customerName);
  if (name < MIN_NAME_SCORE) return null;

  const raw =
    MATCH_WEIGHTS.name * name +
    MATCH_WEIGHTS.timing * timing.score +
    MATCH_WEIGHTS.engagement * engagementScore;

  const reasons = [
    `Review author "${review.author}" resembles customer "${request.customerName}".`,
    `Posted ${describeGap(timing.days)}.`,
    engagementDescription(request.status),
  ];

  return {
    reviewId: review.id,
    requestId: request.id,
    confidence: round(Math.min(MAX_CONFIDENCE, raw)),
    nameScore: round(name),
    timingScore: round(timing.score),
    engagementScore: round(engagementScore),
    reasons,
  };
}

function engagementDescription(status: ReviewRequest["status"]): string {
  switch (status) {
    case "posted_google":
      return "The request was already marked as posted to Google.";
    case "clicked":
      return "The customer clicked through to Google from the request.";
    case "opened":
      return "The customer opened the request.";
    case "delivered":
      return "The request was delivered.";
    case "private_feedback":
      return "The customer left private feedback on this request.";
    default:
      return "The request was sent.";
  }
}

/**
 * Match imported reviews to the requests that plausibly produced them.
 *
 * Pure and deterministic: no clock, no I/O. Assignment is greedy on descending
 * confidence and strictly 1:1 — one review cannot be credited to two requests,
 * and one request cannot claim two reviews.
 */
export function matchReviewsToRequests(input: {
  reviews: readonly Review[];
  requests: readonly ReviewRequest[];
}): ReviewMatchOutcome {
  const matches: ReviewMatch[] = [];
  const rejected: ReviewMatch[] = [];
  const ambiguous: string[] = [];
  const candidates: ReviewMatch[] = [];

  for (const review of input.reviews) {
    const scored: ReviewMatch[] = [];
    for (const request of input.requests) {
      if (request.locationId !== review.locationId) continue;
      const pair = scorePair(review, request);
      if (pair) scored.push(pair);
    }
    scored.sort(compareCandidates);

    const best = scored[0];
    if (!best) continue;
    if (best.confidence < MATCH_THRESHOLD) {
      rejected.push(...scored);
      continue;
    }
    const runnerUp = scored[1];
    // Two customers fit equally well. Picking one would be a coin flip
    // presented as a finding, so we attribute the review to neither.
    if (
      runnerUp &&
      runnerUp.confidence >= MATCH_THRESHOLD &&
      best.confidence - runnerUp.confidence < AMBIGUITY_MARGIN
    ) {
      ambiguous.push(review.id);
      rejected.push(...scored);
      continue;
    }
    candidates.push(...scored.filter((pair) => pair.confidence >= MATCH_THRESHOLD));
    rejected.push(...scored.filter((pair) => pair.confidence < MATCH_THRESHOLD));
  }

  candidates.sort(compareCandidates);
  const takenReviews = new Set<string>();
  const takenRequests = new Set<string>();
  for (const candidate of candidates) {
    if (takenReviews.has(candidate.reviewId) || takenRequests.has(candidate.requestId)) {
      rejected.push(candidate);
      continue;
    }
    takenReviews.add(candidate.reviewId);
    takenRequests.add(candidate.requestId);
    matches.push(candidate);
  }

  return { matches, rejected, ambiguous };
}

/** Highest confidence first; ties broken deterministically by id. */
function compareCandidates(a: ReviewMatch, b: ReviewMatch): number {
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  if (a.reviewId !== b.reviewId) return a.reviewId.localeCompare(b.reviewId);
  return a.requestId.localeCompare(b.requestId);
}

/**
 * Project matches onto reviews. Reviews without a surviving match have their
 * attribution CLEARED — a match that no longer holds must not linger as a
 * "Detected" chip.
 */
export function applyReviewMatches(
  reviews: readonly Review[],
  outcome: ReviewMatchOutcome,
): Review[] {
  const byReview = new Map<string, ReviewMatch>();
  for (const match of outcome.matches) byReview.set(match.reviewId, match);
  return reviews.map((review) => {
    const match = byReview.get(review.id);
    if (!match) {
      if (review.matchedRequestId === undefined && review.matchConfidence === undefined) {
        return review;
      }
      const cleared: Review = { ...review };
      delete cleared.matchedRequestId;
      delete cleared.matchConfidence;
      return cleared;
    }
    return { ...review, matchedRequestId: match.requestId, matchConfidence: match.confidence };
  });
}

/**
 * Requests confident enough to advance to their posted/detected state. The bar
 * is higher than MATCH_THRESHOLD because this one writes to the funnel and the
 * staff leaderboard, not just a chip.
 */
export function confidentlyPostedRequestIds(outcome: ReviewMatchOutcome): string[] {
  return outcome.matches
    .filter((match) => match.confidence >= POSTED_THRESHOLD)
    .map((match) => match.requestId);
}
