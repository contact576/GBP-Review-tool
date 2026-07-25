import type { Durability, Review } from "@/lib/data/types";

/**
 * Review Durability Watchdog — the diff engine behind "did this review survive?".
 *
 * Google silently filters reviews. A review that shows up on Monday and is gone
 * on Friday did nothing for the business, but every "review count" in this app
 * would happily keep counting it unless something watches. That watching is the
 * whole point of this module, and it only works if it runs on EVERY import: the
 * evidence is the difference between two imports, so it cannot be backfilled
 * later from a single snapshot.
 *
 * ── THE DURABILITY RULE (one sentence, exactly as the UI may state it) ───────
 *   A review is "vanished" when a review we imported before is missing from a
 *   later successful full import of the profile, "at_risk" when a review that
 *   vanished has since come back, and "stable" otherwise.
 *
 * That is the complete rule. There is deliberately NO other "at risk" signal:
 * Google's review payload gives us only reviewId, reviewer display name, star
 * rating, comment, create time and the owner's reply (see `GbpReview` in
 * lib/google/gbp.ts). It exposes nothing about the reviewer's other activity,
 * account age, or filter state, so any heuristic like "new account with no
 * other reviews" would be invented rather than observed. We would rather show
 * "stable" than a risk flag we cannot defend to the business owner.
 *
 * ── WHY SOME IMPORTS MUST NOT BE DIFFED ──────────────────────────────────────
 * Marking a review "vanished" is a claim about Google's behaviour. If we make
 * that claim because our own fetch failed, we have manufactured a scandal out
 * of a network blip. `diffSkipReason` below is the explicit guard: a failed
 * fetch, an empty payload where we previously had reviews, or an implausible
 * collapse in review count all disable vanish-marking for that run. Stored
 * reviews are then left exactly as they were — never deleted, never re-flagged.
 */

/**
 * How much a review import can be trusted as a statement about what is live.
 *
 * - "authoritative": the Business Profile API's full review history. Absence
 *   from a successful import is real evidence the review is gone.
 * - "sample": the public Places payload, which returns at most 5 reviews and
 *   rotates which ones. Absence there is evidence of NOTHING, so this mode can
 *   never mark a review vanished; stale sample rows are simply dropped.
 */
export type ReviewImportMode = "authoritative" | "sample";

export type ImportDiffSkipReason =
  | "import_failed"
  | "empty_import"
  | "implausible_shrink"
  | "non_diffable_source";

/**
 * Safety thresholds for the vanish guard. A real profile does lose reviews, so
 * these are deliberately loose: they only catch collapses that are far more
 * likely to be a truncated/partial page than a genuine mass deletion.
 */
export const VANISH_GUARD = {
  /** Below this share of the previous import, treat the payload as suspect. */
  MIN_RETAINED_RATIO: 0.5,
  /** ...but only when the absolute drop is at least this many reviews. */
  MIN_ABSOLUTE_DROP: 5,
} as const;

/** The rule, in one sentence, for UI copy and tooltips. */
export const DURABILITY_RULE =
  "A review is marked vanished when a review we imported before is missing from a later successful full import of your profile, at risk when a review that vanished has since come back, and stable otherwise.";

/**
 * Durability stamped on a review the moment it is fetched, BEFORE it has been
 * diffed against stored history.
 *
 * A single import in isolation contains no evidence of filtering, so the only
 * honest value is "stable". The real value is assigned by
 * `reconcileReviewImport`, which the providers run against stored history on
 * every sync. This constant exists so the fetch layer has exactly one place to
 * point at instead of scattering a bare `"stable"` literal that looks like a
 * verdict.
 */
export const PRE_RECONCILE_DURABILITY: Durability = "stable";

export interface ReviewImportPlan {
  /** Reviews seen for the first time — insert them. */
  inserts: Review[];
  /** Reviews already stored whose persisted fields changed — update them. */
  updates: Review[];
  /** Previously stored reviews now missing from a trustworthy import. */
  vanished: Review[];
  /**
   * Stale rows to delete. Only ever populated in "sample" mode, where a row
   * dropping out of Google's rotating 5-review sample means nothing at all.
   */
  removed: Review[];
  /** Stored reviews left untouched (absent, but the diff was skipped). */
  retained: Review[];
  /** The full post-import review set, import order first. */
  merged: Review[];
  /** True when this import was trustworthy enough to mark reviews vanished. */
  diffed: boolean;
  /** Why vanish-marking was skipped, when it was. */
  skipReason?: ImportDiffSkipReason;
}

export interface ReviewImportInput {
  /** Previously stored reviews from the SAME import source. */
  existing: readonly Review[];
  /** Freshly fetched reviews. Their `durability` field is ignored. */
  imported: readonly Review[];
  nowIso: string;
  /** False when the upstream fetch errored or returned a partial payload. */
  importOk?: boolean;
  mode?: ReviewImportMode;
}

/**
 * Decide whether this import may be used to mark reviews vanished.
 *
 * Returns `undefined` when the diff is safe to run, otherwise the reason it was
 * refused. Every branch here is a case where "the review is gone from Google"
 * and "our fetch came back wrong" are indistinguishable — and in that tie we
 * always choose to keep the review.
 */
export function diffSkipReason(input: {
  importOk: boolean;
  mode: ReviewImportMode;
  existingCount: number;
  importedCount: number;
}): ImportDiffSkipReason | undefined {
  // A rotating ≤5 public sample can never testify that a review was removed.
  if (input.mode !== "authoritative") return "non_diffable_source";
  // The fetch itself failed (auth expired, 5xx, quota). Nothing was observed.
  if (!input.importOk) return "import_failed";
  // Zero reviews back while we hold some: overwhelmingly a broken/empty page,
  // not a profile that lost every review at once.
  if (input.importedCount === 0 && input.existingCount > 0) return "empty_import";
  // A large sudden collapse looks like a truncated page (pagination/quota),
  // so we decline to convert it into dozens of "your review vanished" alerts.
  const drop = input.existingCount - input.importedCount;
  if (
    drop >= VANISH_GUARD.MIN_ABSOLUTE_DROP &&
    input.importedCount < input.existingCount * VANISH_GUARD.MIN_RETAINED_RATIO
  ) {
    return "implausible_shrink";
  }
  return undefined;
}

/**
 * Sanity-check a full import against the total Google reports for the profile.
 *
 * A page that came back drastically shorter than Google's own count is a
 * truncated read (quota, pagination, a partial 200) rather than a profile that
 * lost most of its reviews, so the caller must not let it drive vanish-marking.
 * Small shortfalls are expected and tolerated — Google's aggregate count and the
 * reviews it will actually hand back are never exactly equal.
 */
export function isPlausibleFullImport(
  fetched: number,
  reportedTotal: number | undefined,
): boolean {
  if (!reportedTotal || reportedTotal <= 0) return true; // nothing to compare to
  if (reportedTotal - fetched < VANISH_GUARD.MIN_ABSOLUTE_DROP) return true;
  return fetched >= reportedTotal * VANISH_GUARD.MIN_RETAINED_RATIO;
}

/**
 * The durability rule, isolated for direct testing.
 *
 * `diffed` is false for imports the guard refused; in that case we carry the
 * previously known value forward verbatim rather than inventing a transition
 * from an observation we do not trust.
 */
export function nextDurability(
  prior: Review | undefined,
  presentInImport: boolean,
  diffed: boolean,
): Durability {
  if (!diffed) return prior?.durability ?? PRE_RECONCILE_DURABILITY;
  if (!presentInImport) return prior ? "vanished" : PRE_RECONCILE_DURABILITY;
  // Present now. If we ever recorded it as gone, it came back — Google's filter
  // is still churning on this review, which is a real, observed risk signal.
  if (prior?.durability === "vanished" || prior?.vanishedAt) return "at_risk";
  if (prior?.durability === "at_risk") return "at_risk"; // sticky: it happened.
  return "stable";
}

/**
 * Diff a fresh import against what we already stored and produce the exact set
 * of writes. Pure: no clock, no database, no network — the caller supplies
 * `nowIso` and applies the plan.
 */
export function reconcileReviewImport(input: ReviewImportInput): ReviewImportPlan {
  const { existing, imported, nowIso } = input;
  const importOk = input.importOk ?? true;
  const mode = input.mode ?? "authoritative";

  const priorById = new Map<string, Review>();
  for (const review of existing) priorById.set(review.id, review);

  const skipReason = diffSkipReason({
    importOk,
    mode,
    existingCount: existing.length,
    importedCount: imported.length,
  });
  const diffed = skipReason === undefined;

  const inserts: Review[] = [];
  const updates: Review[] = [];
  const merged: Review[] = [];
  const seen = new Set<string>();

  for (const fresh of imported) {
    if (seen.has(fresh.id)) continue; // defensive: never process an id twice
    seen.add(fresh.id);
    const prior = priorById.get(fresh.id);
    const next = withDurability(prior, fresh, diffed);
    merged.push(next);
    if (!prior) inserts.push(next);
    else if (!sameStoredReview(prior, next)) updates.push(next);
  }

  const vanished: Review[] = [];
  const removed: Review[] = [];
  const retained: Review[] = [];
  // A sample import may drop stale rows, but only when it actually returned
  // something — an empty/failed sample must never wipe the stored sample.
  const sampleMayPrune = mode === "sample" && importOk && imported.length > 0;

  for (const prior of existing) {
    if (seen.has(prior.id)) continue;
    if (diffed) {
      const marked: Review = {
        ...prior,
        durability: nextDurability(prior, false, true),
        // Keep the FIRST time we noticed it gone; re-confirming absence must
        // not keep resetting the clock the "vanished in the last 30 days"
        // dashboards read from.
        vanishedAt: prior.vanishedAt ?? nowIso,
      };
      if (sameStoredReview(prior, marked)) retained.push(prior);
      else vanished.push(marked);
      merged.push(marked);
      continue;
    }
    if (sampleMayPrune) {
      removed.push(prior);
      continue;
    }
    retained.push(prior);
    merged.push(prior);
  }

  return {
    inserts,
    updates,
    vanished,
    removed,
    retained,
    merged,
    diffed,
    ...(skipReason ? { skipReason } : {}),
  };
}

/**
 * Fold a freshly fetched review onto whatever we already knew about it.
 * Google owns the content fields; we own the accumulated durability and
 * attribution history, which an import must never reset.
 */
function withDurability(
  prior: Review | undefined,
  fresh: Review,
  diffed: boolean,
): Review {
  const durability = nextDurability(prior, true, diffed);
  const next: Review = {
    ...fresh,
    durability,
    // `vanishedAt` is history, not state: keeping it is what lets the UI say
    // "this one disappeared on the 4th and came back" instead of just "at risk".
    ...(prior?.vanishedAt ? { vanishedAt: prior.vanishedAt } : {}),
    ...(prior?.matchedRequestId ? { matchedRequestId: prior.matchedRequestId } : {}),
    ...(typeof prior?.matchConfidence === "number"
      ? { matchConfidence: prior.matchConfidence }
      : {}),
  };
  const reply = fresh.reply ?? prior?.reply;
  return reply ? { ...next, reply } : next;
}

/** Compare only the fields that are persisted, so no-op imports write nothing. */
function sameStoredReview(a: Review, b: Review): boolean {
  return (
    a.author === b.author &&
    a.rating === b.rating &&
    a.text === b.text &&
    a.publishedAt === b.publishedAt &&
    a.needsReply === b.needsReply &&
    a.durability === b.durability &&
    (a.vanishedAt ?? null) === (b.vanishedAt ?? null) &&
    (a.matchedRequestId ?? null) === (b.matchedRequestId ?? null) &&
    (a.matchConfidence ?? null) === (b.matchConfidence ?? null)
  );
}
