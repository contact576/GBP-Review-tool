/**
 * One view model for the Visibility page, built from the persisted snapshot.
 *
 * There is exactly one source now: `FoundlyData.aeo`, written by
 * `DataProvider.saveAeoSnapshot` after a run (and pre-populated for the seeded
 * demo workspace). The page never reads the audit log for results.
 *
 * Two shapes can be in that column:
 *   - a snapshot this version wrote, where every query carries an explicit
 *     `status` and the fraction was computed over checked queries only;
 *   - a legacy snapshot written before `status` existed, whose queries were all
 *     real verdicts and whose stored fraction is its own headline claim.
 *
 * Nothing is upgraded into a stronger claim than the stored row already made.
 */

import type { AeoSnapshot } from "@/lib/data/types";
import { outcomesFromSnapshot } from "./persistence";
import type { AeoQueryOutcome } from "./types";

export interface AeoView {
  /** ISO timestamp (or ISO date, on a legacy snapshot) of the run. */
  ranAt: string;
  /** Provider id recorded with the run, e.g. "anthropic". Null if unrecorded. */
  provider: string | null;
  /** Exact model id that produced these answers. Null if unrecorded. */
  model: string | null;
  /** Human label shown beside every claim. Null when nothing was recorded. */
  assistantLabel: string | null;
  results: AeoQueryOutcome[];
  /** Headline fraction. The denominator is only ever questions we really checked. */
  headline: { named: number; checked: number };
  notChecked: number;
}

/** Product names for the assistants this app can run against. */
const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Claude",
  openai: "ChatGPT",
  google: "Google Gemini",
  perplexity: "Perplexity",
};

/** Product name for a recorded provider id; the raw id if we don't know it. */
export function providerDisplayName(provider: string): string {
  const key = provider.trim();
  return PROVIDER_LABELS[key] ?? key;
}

/**
 * "Claude (claude-haiku-4-5)" — the exact model is part of the label so the
 * claim stays attributable to one specific assistant. Null when the run never
 * recorded a provider (legacy snapshot) or ran with none configured.
 */
export function assistantLabelFor(
  provider: string | null | undefined,
  model: string | null | undefined,
): string | null {
  const providerId = provider?.trim();
  const modelId = model?.trim();
  if (!providerId || providerId === "none") return null;
  const name = PROVIDER_LABELS[providerId] ?? providerId;
  return modelId && modelId !== "none" ? `${name} (${modelId})` : name;
}

export function viewFromSnapshot(snapshot: AeoSnapshot | undefined | null): AeoView | null {
  if (!snapshot) return null;
  const results = outcomesFromSnapshot(snapshot);
  const storedTotal = snapshot.namedFraction?.total ?? 0;
  if (results.length === 0 && storedTotal === 0) return null;

  const checkedResults = results.filter((result) => result.status === "checked");
  const derived = {
    named: checkedResults.filter((result) => result.status === "checked" && result.named).length,
    checked: checkedResults.length,
  };

  // A snapshot that carries `status` on any query was written by this version,
  // which always recomputes the fraction from the rows it stored — so the rows
  // are authoritative. A legacy snapshot may list only a sample of its queries,
  // so its own stored fraction is the honest headline for it.
  const carriesStatus = (snapshot.queries ?? []).some((query) => query.status !== undefined);
  const headline =
    carriesStatus || storedTotal === 0
      ? derived
      : { named: snapshot.namedFraction?.named ?? 0, checked: storedTotal };

  const provider = nonEmpty(snapshot.provider);
  const model = nonEmpty(snapshot.model);
  return {
    ranAt: snapshot.date,
    provider,
    model,
    assistantLabel: assistantLabelFor(provider, model),
    results,
    headline,
    notChecked: results.length - checkedResults.length,
  };
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "none" ? trimmed : null;
}
