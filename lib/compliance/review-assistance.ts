/**
 * Guardrails for customer-authored review assistance.
 *
 * Foundly may clean up a customer's own words, but it must never invent a
 * service, person, location, claim, sentiment, or ranking keyword for them.
 */

const FUNCTION_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for",
  "from", "had", "has", "have", "i", "in", "is", "it", "my", "of", "on",
  "or", "our", "so", "that", "the", "their", "they", "this", "to", "was",
  "we", "were", "with", "would", "you", "your",
]);

const PROMOTIONAL_INSERTIONS = [
  "best in town",
  "highly recommend",
  "five stars",
  "10/10",
  "top-rated",
  "number one",
];

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^['-]+|['-]+$/g, ""))
    .filter(Boolean);
}
function tokenIsGrounded(token: string, original: Set<string>): boolean {
  if (FUNCTION_WORDS.has(token) || token.length <= 3) return true;
  if (original.has(token)) return true;
  const stem = token.replace(/(ing|ed|es|s|ly)$/i, "");
  return stem.length >= 4 && [...original].some((source) => {
    const sourceStem = source.replace(/(ing|ed|es|s|ly)$/i, "");
    return sourceStem === stem;
  });
}

export function normalizeCustomerReviewText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const first = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return /[.!?]$/.test(first) ? first : `${first}.`;
}

export interface ReviewEditCheck {
  ok: boolean;
  reasons: string[];
}

export function checkFaithfulReviewEdit(originalText: string, candidateText: string): ReviewEditCheck {
  const original = normalizeCustomerReviewText(originalText);
  const candidate = normalizeCustomerReviewText(candidateText);
  const reasons: string[] = [];

  if (!original || !candidate) reasons.push("empty_text");
  if (candidate.length > original.length * 1.35 + 24) reasons.push("expanded_too_far");

  const originalNumbers = new Set(original.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []);
  const addedNumbers = (candidate.match(/\b\d+(?:[.,]\d+)?\b/g) ?? [])
    .filter((value) => !originalNumbers.has(value));
  if (addedNumbers.length) reasons.push("invented_number");

  const originalLower = original.toLowerCase();
  const candidateLower = candidate.toLowerCase();
  if (PROMOTIONAL_INSERTIONS.some(
    (phrase) => candidateLower.includes(phrase) && !originalLower.includes(phrase),
  )) {
    reasons.push("promotional_insertion");
  }

  const sourceTokens = new Set(tokens(original));
  const novel = [...new Set(tokens(candidate).filter((token) => !tokenIsGrounded(token, sourceTokens)))];
  const novelLimit = Math.max(2, Math.floor(sourceTokens.size * 0.08));
  if (novel.length > novelLimit) reasons.push("invented_content");

  return { ok: reasons.length === 0, reasons };
}
