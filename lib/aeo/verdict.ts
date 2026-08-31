/**
 * Turns one validated model reply into a verdict — deterministically.
 *
 * Every field published here is re-derived from the literal answer text. The
 * model's own list of business names is treated as an extraction hint only:
 * a name it reports but did not actually write is discarded, and a mention it
 * forgot to report is still counted. Nothing is inferred, guessed or defaulted.
 */

import {
  businessMentionIndex,
  mentionsBusiness,
  sameBusiness,
  verbatimExcerpt,
  verifyNamesInAnswer,
  isVerbatimExcerpt,
} from "./matching";
import type { AeoAnswerPayload } from "./schema";
import type { AeoBusinessContext, AeoCheckedQuery } from "./types";

const MAX_COMPETITORS = 8;
const MAX_EXCERPT_CHARS = 260;

export function deriveVerdict(
  query: string,
  payload: AeoAnswerPayload,
  context: AeoBusinessContext,
): AeoCheckedQuery {
  const { answer } = payload;
  const matchContext = { city: context.city, category: context.category };

  // 1. Was the business named? Decided from the answer text, not from the model.
  const named = mentionsBusiness(answer, context.businessName, matchContext);

  // 2. Which other names really appear, in order of first appearance?
  const verified = verifyNamesInAnswer(answer, payload.businessesNamed);
  const competitors = verified
    .filter((entry) => !sameBusiness(entry.name, context.businessName))
    .map((entry) => entry.name)
    .slice(0, MAX_COMPETITORS);

  // 3. Position = order of first appearance among every business in the answer,
  //    including ourselves even when the model forgot to list us.
  let position: number | null = null;
  if (named) {
    const ourIndex = businessMentionIndex(answer, context.businessName, matchContext);
    const rivalIndexes = verified
      .filter((entry) => !sameBusiness(entry.name, context.businessName))
      .map((entry) => entry.index);
    position = ourIndex === -1 ? 1 : rivalIndexes.filter((index) => index < ourIndex).length + 1;
  }

  // 4. The excerpt must be the assistant's own words. A rewritten one is
  //    thrown away and replaced with a real slice of the answer.
  const focus = named ? context.businessName : competitors[0];
  const excerpt = verbatimExcerpt(answer, { focus, maxChars: MAX_EXCERPT_CHARS });

  return {
    status: "checked",
    query,
    named,
    position,
    competitorsNamed: competitors,
    answerExcerpt: excerpt,
  };
}

/** Exported for tests: an excerpt is only publishable if it is really in the answer. */
export function excerptIsHonest(answer: string, excerpt: string): boolean {
  return isVerbatimExcerpt(answer, excerpt);
}
