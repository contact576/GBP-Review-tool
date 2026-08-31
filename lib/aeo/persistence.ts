/**
 * Persistence for AI-Visibility runs.
 *
 * Results live in `FoundlyData.aeo` (`dataset_meta.aeo`), written through
 * `DataProvider.saveAeoSnapshot` and read back by `getData()`. That is the only
 * place the Visibility page reads from.
 *
 * The audit log still gets a row per run, but only for the RUN EVENT itself —
 * who ran it, when, against which model, and the three headline counters. That
 * matches how every other privileged action in this codebase records itself
 * (see `profile.change_approved` in lib/actions.ts), and it is what the durable
 * monthly quota is counted from (lib/aeo/metering.ts). No result payload is
 * encoded into `meta` any more.
 *
 * ── The checked / not-checked contract, which this file is responsible for ──
 * `AeoQueryResult.named` is a bare, non-optional boolean, so a not-checked
 * query has to be written with SOME value in it. The distinction is carried by
 * `status` + `notCheckedReason` instead:
 *
 *   - Writing: a not-checked outcome is stored as `status: "not_checked"` with
 *     its reason, `named: false`, `position: null`, no competitors and an empty
 *     excerpt — so there is no fabricated verdict content anywhere on the row.
 *   - Counting: `namedFraction.total` counts CHECKED rows only, so a
 *     not-checked row can never move the headline fraction in either direction.
 *   - Reading: `outcomeFromStored` branches on `status` FIRST and returns the
 *     `not_checked` arm of the union, which the UI renders as "Not checked"
 *     with its reason — never as "Not named".
 *
 * The one lossy edge, stated plainly: `AeoQueryResult` has no field for the
 * operator-facing `detail` string (provider error text, validation failure), so
 * it is returned in the run's HTTP response and then dropped. `status` and
 * `reason` — everything the UI shows — survive the round trip.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { AeoQueryResult, AeoSnapshot, AuditLog, LocationId } from "@/lib/data/types";
import type { AeoNotCheckedReason, AeoQueryOutcome, AeoRunRecord } from "./types";
import { NOT_CHECKED_COPY } from "./types";

export const AEO_RUN_ACTION = "aeo.check_run";
export const AEO_RUN_TARGET_TYPE = "aeo_snapshot";

const MAX_STORED_QUERIES = 8;
const MAX_STORED_EXCERPT = 400;
const MAX_STORED_COMPETITORS = 6;
const MAX_STORED_QUERY_TEXT = 200;

/**
 * Trim a record to a size that is safe to store in a single JSON column, and
 * recompute the counters from what survived so the stored totals always agree
 * with the stored rows.
 */
export function boundRunRecord(record: AeoRunRecord): AeoRunRecord {
  const results = record.results.slice(0, MAX_STORED_QUERIES).map<AeoQueryOutcome>((result) =>
    result.status === "checked"
      ? {
          status: "checked",
          query: result.query.slice(0, MAX_STORED_QUERY_TEXT),
          named: result.named,
          position: result.named ? result.position : null,
          competitorsNamed: result.competitorsNamed.slice(0, MAX_STORED_COMPETITORS),
          answerExcerpt: result.answerExcerpt.slice(0, MAX_STORED_EXCERPT),
        }
      : {
          status: "not_checked",
          query: result.query.slice(0, MAX_STORED_QUERY_TEXT),
          reason: result.reason,
          detail: result.detail.slice(0, MAX_STORED_QUERY_TEXT),
        },
  );
  const checked = results.filter((result) => result.status === "checked");
  return {
    ...record,
    results,
    checked: checked.length,
    notChecked: results.length - checked.length,
    named: checked.filter((result) => result.status === "checked" && result.named).length,
  };
}

/** The durable shape. One run in, one snapshot out — no verdict is invented. */
export function toAeoSnapshot(record: AeoRunRecord, locationId: LocationId): AeoSnapshot {
  const bounded = boundRunRecord(record);
  return {
    locationId,
    // Full ISO timestamp rather than a bare date: this is a point-in-time
    // sample and the UI attributes it to an instant. `formatDate` reads both.
    date: bounded.ranAt,
    // CHECKED queries only. A run of 6 questions where 2 failed stores
    // `{ named: 3, total: 4 }`, never `{ named: 3, total: 6 }`.
    namedFraction: { named: bounded.named, total: bounded.checked },
    queries: bounded.results.map(toStoredQuery),
    provider: bounded.provider,
    model: bounded.model,
  };
}

function toStoredQuery(outcome: AeoQueryOutcome): AeoQueryResult {
  if (outcome.status === "not_checked") {
    return {
      query: outcome.query,
      status: "not_checked",
      notCheckedReason: outcome.reason,
      // `named` cannot be omitted from the stored shape. It is NOT a verdict on
      // this row — `status` is what every reader branches on, and the row is
      // excluded from `namedFraction` entirely. The remaining fields are left
      // empty so nothing on the row can be mistaken for a real answer.
      named: false,
      position: null,
      competitorsNamed: [],
      answerExcerpt: "",
    };
  }
  return {
    query: outcome.query,
    status: "checked",
    named: outcome.named,
    position: outcome.named ? outcome.position : null,
    competitorsNamed: outcome.competitorsNamed,
    answerExcerpt: outcome.answerExcerpt,
  };
}

const REASONS = new Set<string>(Object.keys(NOT_CHECKED_COPY));

function knownReason(value: unknown): AeoNotCheckedReason {
  return typeof value === "string" && REASONS.has(value)
    ? (value as AeoNotCheckedReason)
    : "unreadable_record";
}

/**
 * Read one stored row back into the union.
 *
 * A value in the database is untrusted input like any other, so this is a
 * re-validation and not a cast. Every failure mode lands on "not checked" —
 * the direction that claims less — rather than on a verdict.
 */
export function outcomeFromStored(stored: AeoQueryResult): AeoQueryOutcome {
  const query = typeof stored.query === "string" ? stored.query : "";
  // Widened to `string` on purpose: the column can hold anything a previous or
  // future version wrote, not just the two literals the type advertises.
  const status: string | undefined = stored.status;

  if (status === "not_checked") {
    return {
      status: "not_checked",
      query,
      reason: knownReason(stored.notCheckedReason),
      // Operator detail is not part of the durable shape — see the header.
      detail: "",
    };
  }

  // An unrecognised status, or a `named` that is not a boolean, means we cannot
  // tell what this row recorded. That is exactly a "not checked", never a
  // "not named".
  if ((status !== undefined && status !== "checked") || typeof stored.named !== "boolean") {
    return { status: "not_checked", query, reason: "unreadable_record", detail: "" };
  }

  // No status at all = a legacy snapshot, written before the field existed.
  // Those rows were all real verdicts and are taken at exactly that value.
  const position =
    typeof stored.position === "number" && Number.isInteger(stored.position) && stored.position > 0
      ? stored.position
      : null;
  return {
    status: "checked",
    query,
    named: stored.named,
    position: stored.named ? position : null,
    competitorsNamed: Array.isArray(stored.competitorsNamed)
      ? stored.competitorsNamed
          .filter((item): item is string => typeof item === "string")
          .slice(0, MAX_STORED_COMPETITORS)
      : [],
    answerExcerpt: typeof stored.answerExcerpt === "string" ? stored.answerExcerpt : "",
  };
}

/** Every stored row as an outcome. Rows with no question text are dropped. */
export function outcomesFromSnapshot(snapshot: AeoSnapshot | null | undefined): AeoQueryOutcome[] {
  if (!snapshot || !Array.isArray(snapshot.queries)) return [];
  return snapshot.queries.map(outcomeFromStored).filter((outcome) => outcome.query.length > 0);
}

/**
 * The audit trail for the run event. Pure audit: actor, action, target and
 * time, plus scalar counters an admin can scan. The results are NOT here —
 * they are in the snapshot. This row is also the durable quota counter.
 */
export function buildAeoRunAuditEntry(input: {
  id: string;
  workspaceId: string;
  actor: string;
  record: AeoRunRecord;
}): AuditLog {
  const record = boundRunRecord(input.record);
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: AEO_RUN_ACTION,
    targetType: AEO_RUN_TARGET_TYPE,
    targetId: record.runId,
    at: record.ranAt,
    meta: {
      provider: record.provider,
      model: record.model,
      checked: record.checked,
      notChecked: record.notChecked,
      named: record.named,
    },
  };
}
