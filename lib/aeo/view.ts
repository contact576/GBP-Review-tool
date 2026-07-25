/**
 * One view model for the Visibility page, whichever source the data came from.
 *
 * Two sources exist today: a real run recorded by `POST /api/aeo/run`, and the
 * legacy `FoundlyData.aeo` snapshot (which is how the seeded demo workspace is
 * populated). The snapshot shape predates the checked/not-checked distinction,
 * so every snapshot query maps to `checked` — that is exactly what it claims to
 * be, and nothing is upgraded into a stronger claim than it already made.
 */

import type { AeoSnapshot } from "@/lib/data/types";
import type { AeoQueryOutcome, AeoRunRecord } from "./types";

export interface AeoView {
  source: "run" | "snapshot";
  /** ISO timestamp (run) or ISO date (snapshot). */
  ranAt: string;
  /** Which assistant answered. Null for a legacy snapshot that never recorded one. */
  assistantLabel: string | null;
  results: AeoQueryOutcome[];
  /** Headline fraction. The denominator is only ever questions we really checked. */
  headline: { named: number; checked: number };
  notChecked: number;
}

export function viewFromRun(record: AeoRunRecord): AeoView {
  return {
    source: "run",
    ranAt: record.ranAt,
    assistantLabel: record.assistantLabel,
    results: record.results,
    headline: { named: record.named, checked: record.checked },
    notChecked: record.notChecked,
  };
}

export function viewFromSnapshot(snapshot: AeoSnapshot | undefined | null): AeoView | null {
  if (!snapshot) return null;
  const queries = snapshot.queries ?? [];
  const total = snapshot.namedFraction?.total ?? 0;
  if (queries.length === 0 && total === 0) return null;
  return {
    source: "snapshot",
    ranAt: snapshot.date,
    assistantLabel: null,
    results: queries.map<AeoQueryOutcome>((query) => ({
      status: "checked",
      query: query.query,
      named: query.named,
      position: query.position,
      competitorsNamed: query.competitorsNamed,
      answerExcerpt: query.answerExcerpt,
    })),
    headline: {
      named: snapshot.namedFraction?.named ?? 0,
      checked: total || queries.length,
    },
    notChecked: 0,
  };
}

/** Newest wins. A real run always supersedes a stale seeded snapshot. */
export function resolveAeoView(
  run: AeoRunRecord | null,
  snapshot: AeoSnapshot | undefined | null,
): AeoView | null {
  const fromRun = run ? viewFromRun(run) : null;
  const fromSnapshot = viewFromSnapshot(snapshot);
  if (!fromRun) return fromSnapshot;
  if (!fromSnapshot) return fromRun;
  return Date.parse(fromRun.ranAt) >= Date.parse(fromSnapshot.ranAt) ? fromRun : fromSnapshot;
}
