/**
 * Deterministic text matching over an assistant's answer.
 *
 * The model is never asked "were you named?" — asking it that would let it
 * grade its own homework and would let a hallucinated boolean become a product
 * claim. Instead the model returns its answer plus the business names it wrote,
 * and every fact we publish is re-derived here from that literal text:
 *
 *   - `named`      -> is the business name actually present in the answer?
 *   - `position`   -> order of first appearance among the named businesses
 *   - competitors  -> only names verified to appear verbatim in the answer
 *   - excerpt      -> a contiguous slice of the answer, never a paraphrase
 *
 * All of it is pure and unit-testable with no network.
 */

/** Words that carry no identifying signal in a business name. */
const GENERIC_NAME_TOKENS = new Set([
  "the", "and", "for", "with", "your", "our",
  "inc", "llc", "ltd", "co", "corp", "corporation", "company", "group", "holdings",
  "services", "service", "solutions", "professional", "professionals",
]);

/**
 * Lowercase, expand "&", drop punctuation, collapse whitespace. Comparisons
 * happen in this space so "Joe's Café & Co." and "Joes Cafe and Co" match.
 */
export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  const normalized = normalizeForMatch(value);
  return normalized ? normalized.split(" ") : [];
}

/** Whole-word containment in already-normalized text (no partial-word hits). */
export function containsPhrase(normalizedHaystack: string, normalizedNeedle: string): boolean {
  if (!normalizedHaystack || !normalizedNeedle) return false;
  return ` ${normalizedHaystack} `.includes(` ${normalizedNeedle} `);
}

/** Index of a whole-word phrase in normalized text, or -1. */
export function indexOfPhrase(normalizedHaystack: string, normalizedNeedle: string): number {
  if (!normalizedHaystack || !normalizedNeedle) return -1;
  const index = ` ${normalizedHaystack} `.indexOf(` ${normalizedNeedle} `);
  return index === -1 ? -1 : index;
}

/**
 * The tokens of a business name that actually identify it — generic words and
 * anything already implied by the city or category are dropped, because
 * "Toronto" and "dental" in an answer about dentists in Toronto prove nothing.
 */
export function distinctiveTokens(businessName: string, genericContext: string): string[] {
  const generic = new Set(tokenize(genericContext));
  return tokenize(businessName).filter(
    (token) => token.length >= 3 && !GENERIC_NAME_TOKENS.has(token) && !generic.has(token),
  );
}

export interface MatchContext {
  city: string;
  category: string;
}

/**
 * Is the business named in this answer?
 *
 * Exact whole-name containment is the primary test. When the model writes a
 * near-variant ("Harbourview Physiotherapy Clinic" for "Harbourview
 * Physiotherapy"), we fall back to requiring EVERY distinctive token — and only
 * when at least one distinctive token exists. A fully generic name
 * ("Toronto Dental") gets the exact test only, so a generic answer can never be
 * scored as a mention.
 */
export function mentionsBusiness(
  answer: string,
  businessName: string,
  context: MatchContext,
): boolean {
  const hay = normalizeForMatch(answer);
  const needle = normalizeForMatch(businessName);
  if (!hay || !needle) return false;
  if (containsPhrase(hay, needle)) return true;
  const tokens = distinctiveTokens(businessName, `${context.city} ${context.category}`);
  if (tokens.length === 0) return false;
  return tokens.every((token) => containsPhrase(hay, token));
}

/** Where the business first appears in the normalized answer, or -1. */
export function businessMentionIndex(
  answer: string,
  businessName: string,
  context: MatchContext,
): number {
  const hay = normalizeForMatch(answer);
  const exact = indexOfPhrase(hay, normalizeForMatch(businessName));
  if (exact !== -1) return exact;
  const tokens = distinctiveTokens(businessName, `${context.city} ${context.category}`);
  const indexes = tokens.map((token) => indexOfPhrase(hay, token)).filter((index) => index !== -1);
  if (indexes.length !== tokens.length || indexes.length === 0) return -1;
  return Math.min(...indexes);
}

/** Do two business names refer to the same business? Containment either way. */
export function sameBusiness(a: string, b: string): boolean {
  const left = normalizeForMatch(a);
  const right = normalizeForMatch(b);
  if (!left || !right) return false;
  return containsPhrase(left, right) || containsPhrase(right, left);
}

export interface VerifiedName {
  name: string;
  /** First index in the normalized answer. Used to order the list. */
  index: number;
}

/**
 * Keep only the names the model claims to have written that are genuinely in
 * the answer, deduped and ordered by first appearance. A name the model
 * invented after the fact is dropped rather than published as a competitor.
 */
export function verifyNamesInAnswer(answer: string, candidates: string[]): VerifiedName[] {
  const hay = normalizeForMatch(answer);
  const seen = new Set<string>();
  const found: VerifiedName[] = [];
  for (const candidate of candidates) {
    const name = candidate.trim().replace(/\s+/g, " ").slice(0, 80);
    if (name.length < 2) continue;
    const normalized = normalizeForMatch(name);
    if (!normalized || seen.has(normalized)) continue;
    const index = indexOfPhrase(hay, normalized);
    if (index === -1) continue;
    seen.add(normalized);
    found.push({ name, index });
  }
  return found.sort((a, b) => a.index - b.index);
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

/**
 * A contiguous verbatim slice of the answer.
 *
 * Only characters that exist in `answer` are returned; the single addition is a
 * leading/trailing ellipsis marking an elision. When `focus` is supplied the
 * sentence containing it is preferred, so the excerpt genuinely supports the
 * verdict rather than being an arbitrary opener.
 */
export function verbatimExcerpt(
  answer: string,
  options: { focus?: string; maxChars?: number } = {},
): string {
  const maxChars = options.maxChars ?? 260;
  const text = answer.trim();
  if (!text) return "";

  const focus = options.focus ? normalizeForMatch(options.focus) : "";
  if (focus) {
    for (const sentence of text.split(SENTENCE_SPLIT)) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      if (containsPhrase(normalizeForMatch(trimmed), focus)) {
        return truncateVerbatim(trimmed, maxChars);
      }
    }
  }
  return truncateVerbatim(text, maxChars);
}

/** Cut at a word boundary and mark the elision. The kept characters are exact. */
function truncateVerbatim(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Is `excerpt` genuinely lifted from `answer`? Used to reject a model-supplied
 * excerpt that has been rewritten, so we can substitute a real one.
 */
export function isVerbatimExcerpt(answer: string, excerpt: string): boolean {
  const candidate = normalizeForMatch(excerpt.replace(/[…]/g, " "));
  if (candidate.length < 12) return false;
  return normalizeForMatch(answer).includes(candidate);
}

/** Short, unambiguous refusals. Long answers are never treated as refusals. */
const REFUSAL_PATTERNS: RegExp[] = [
  /\bi (?:can(?:'|’)?t|cannot|am unable to|won(?:'|’)?t) (?:help|answer|assist|provide|recommend)/i,
  /\bi(?:'|’)?m (?:not able|unable) to (?:help|answer|assist|provide|recommend)/i,
  /\bi (?:don(?:'|’)?t|do not) have (?:access to |any )?(?:real[- ]time|current|up[- ]to[- ]date|reliable) (?:information|data)/i,
  /\bi(?:'|’)?m sorry,? but i /i,
];

export function looksLikeRefusal(answer: string): boolean {
  const text = answer.trim();
  if (!text) return true;
  if (text.length > 400) return false;
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(text));
}
