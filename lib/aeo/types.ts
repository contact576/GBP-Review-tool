/**
 * AI-Visibility (AEO) result types.
 *
 * The single most important distinction in this module: a query that was
 * CHECKED and came back without the business named is NOT the same thing as a
 * query we never managed to check. `lib/data/types.ts#AeoQueryResult` cannot
 * express the difference (its `named` is a bare boolean), so the runner speaks
 * in this richer discriminated union and only ever narrows down to the legacy
 * snapshot shape for queries whose verdict is real.
 *
 * Nothing in this file is ever defaulted to a verdict. If we don't know, we say
 * "not checked" and carry the reason.
 */

/** Why a query has no verdict. Every value maps to plain-language UI copy. */
export type AeoNotCheckedReason =
  | "no_api_key"
  | "model_unavailable"
  | "invalid_output"
  | "refused"
  | "empty_answer";

/** Plain-language copy for each reason — shown verbatim in the UI. */
export const NOT_CHECKED_COPY: Record<AeoNotCheckedReason, string> = {
  no_api_key: "No AI provider is connected, so this question was never asked.",
  model_unavailable: "The assistant could not be reached, so this question has no result.",
  invalid_output: "The assistant's reply could not be read reliably, so no verdict was recorded.",
  refused: "The assistant declined to answer this question, so there is nothing to score.",
  empty_answer: "The assistant returned no answer text, so there is nothing to score.",
};

/** A query we actually asked, with a verdict derived from the real answer. */
export interface AeoCheckedQuery {
  status: "checked";
  query: string;
  /** True only when the business name is present in the assistant's own answer. */
  named: boolean;
  /** 1-based order of first appearance among the businesses named. Null when not named. */
  position: number | null;
  /** Other business names verified to appear verbatim in the same answer. */
  competitorsNamed: string[];
  /** A contiguous span copied out of the assistant's answer — never a paraphrase. */
  answerExcerpt: string;
}

/** A query with no verdict, and the reason why. Never rendered as "not named". */
export interface AeoNotCheckedQuery {
  status: "not_checked";
  query: string;
  reason: AeoNotCheckedReason;
  /** Operator-facing detail (provider error text, validation failure, …). */
  detail: string;
}

export type AeoQueryOutcome = AeoCheckedQuery | AeoNotCheckedQuery;

/** One complete run of the check across a query set. */
export interface AeoRunRecord {
  schemaVersion: 1;
  runId: string;
  /** ISO timestamp of when the run finished. */
  ranAt: string;
  /** Which assistant answered, e.g. "anthropic". */
  provider: string;
  /** Exact model id that produced these answers. */
  model: string;
  /** Human label for the assistant, shown next to every claim. */
  assistantLabel: string;
  results: AeoQueryOutcome[];
  /** Count of queries that produced a real verdict. */
  checked: number;
  /** Count of queries with no verdict. */
  notChecked: number;
  /** Count of CHECKED queries where the business was named. Denominator is `checked`. */
  named: number;
}

/** Where a service list came from — surfaced so the query set is explainable. */
export type AeoServicesSource = "google_profile" | "workspace_settings" | "industry_catalog" | "none";

/** The real workspace facts a check is built from. No invented values. */
export interface AeoBusinessContext {
  locationId: string;
  businessName: string;
  city: string;
  category: string;
  services: string[];
  servicesSource: AeoServicesSource;
}

export function isChecked(outcome: AeoQueryOutcome): outcome is AeoCheckedQuery {
  return outcome.status === "checked";
}

export function isNotChecked(outcome: AeoQueryOutcome): outcome is AeoNotCheckedQuery {
  return outcome.status === "not_checked";
}
