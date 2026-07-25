/**
 * Persistence for AI-Visibility runs.
 *
 * ── Why this looks unusual ───────────────────────────────────────────────
 * `FoundlyData.aeo` is a real, durable column (`dataset_meta.aeo`, typed
 * `AeoSnapshot`), but `DataProvider` exposes NO method to write it — there is a
 * `saveRankGridScan` but no `saveAeoSnapshot`, and this module does not own
 * lib/data/*provider.ts. Rather than ship a feature whose results vanish on
 * reload, runs are written through `DataProvider.appendAuditLog`, which is an
 * existing, tenant-scoped, durable write that `getData()` reads back in full.
 *
 * The record is stored as a bounded JSON string in the entry's `meta`, and is
 * re-validated on every read (a value in the database is untrusted input like
 * any other). The admin audit table renders only actor/action/target/at, so the
 * payload never leaks into that UI.
 *
 * This is a stopgap. The straight-line fix is one provider method:
 *
 *     saveAeoSnapshot(workspaceId: string, snapshot: AeoSnapshot): Promise<void>;
 *
 * mirroring `saveRankGridScan`. When it exists, swap `buildAeoRunAuditEntry`
 * for a snapshot write and keep the audit entry as a pure audit trail.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { AuditLog } from "@/lib/data/types";
import type {
  AeoNotCheckedReason,
  AeoQueryOutcome,
  AeoRunRecord,
} from "./types";
import { NOT_CHECKED_COPY } from "./types";

export const AEO_RUN_ACTION = "aeo.check_run";
export const AEO_RUN_TARGET_TYPE = "aeo_snapshot";

const MAX_STORED_QUERIES = 8;
const MAX_STORED_EXCERPT = 400;
const MAX_STORED_COMPETITORS = 6;
const MAX_ENCODED_CHARS = 24_000;

/** Trim a record to a size that is safe to store in an audit entry. */
export function boundRunRecord(record: AeoRunRecord): AeoRunRecord {
  const results = record.results.slice(0, MAX_STORED_QUERIES).map<AeoQueryOutcome>((result) =>
    result.status === "checked"
      ? {
          status: "checked",
          query: result.query.slice(0, 200),
          named: result.named,
          position: result.position,
          competitorsNamed: result.competitorsNamed.slice(0, MAX_STORED_COMPETITORS),
          answerExcerpt: result.answerExcerpt.slice(0, MAX_STORED_EXCERPT),
        }
      : {
          status: "not_checked",
          query: result.query.slice(0, 200),
          reason: result.reason,
          detail: result.detail.slice(0, 200),
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

export function encodeAeoRun(record: AeoRunRecord): string {
  return JSON.stringify(boundRunRecord(record)).slice(0, MAX_ENCODED_CHARS);
}

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
      run: encodeAeoRun(record),
      provider: record.provider,
      model: record.model,
      checked: record.checked,
      notChecked: record.notChecked,
      named: record.named,
    },
  };
}

const REASONS = new Set<string>(Object.keys(NOT_CHECKED_COPY));

/** Re-validate a stored record. Returns null for anything malformed. */
export function decodeAeoRun(value: unknown): AeoRunRecord | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const raw = parsed as Record<string, unknown>;
  if (raw.schemaVersion !== 1) return null;
  if (typeof raw.runId !== "string" || typeof raw.ranAt !== "string") return null;
  if (typeof raw.provider !== "string" || typeof raw.model !== "string") return null;
  if (typeof raw.assistantLabel !== "string") return null;
  if (!Array.isArray(raw.results)) return null;

  const results: AeoQueryOutcome[] = [];
  for (const item of raw.results) {
    const outcome = decodeOutcome(item);
    if (outcome) results.push(outcome);
  }
  const checked = results.filter((result) => result.status === "checked");
  return {
    schemaVersion: 1,
    runId: raw.runId,
    ranAt: raw.ranAt,
    provider: raw.provider,
    model: raw.model,
    assistantLabel: raw.assistantLabel,
    results,
    checked: checked.length,
    notChecked: results.length - checked.length,
    named: checked.filter((result) => result.status === "checked" && result.named).length,
  };
}

function decodeOutcome(value: unknown): AeoQueryOutcome | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.query !== "string" || raw.query.length === 0) return null;

  if (raw.status === "not_checked") {
    if (typeof raw.reason !== "string" || !REASONS.has(raw.reason)) return null;
    return {
      status: "not_checked",
      query: raw.query,
      reason: raw.reason as AeoNotCheckedReason,
      detail: typeof raw.detail === "string" ? raw.detail : "",
    };
  }
  if (raw.status !== "checked") return null;
  if (typeof raw.named !== "boolean") return null;
  const position =
    raw.position === null
      ? null
      : typeof raw.position === "number" && Number.isInteger(raw.position) && raw.position > 0
        ? raw.position
        : null;
  return {
    status: "checked",
    query: raw.query,
    named: raw.named,
    position: raw.named ? position : null,
    competitorsNamed: Array.isArray(raw.competitorsNamed)
      ? raw.competitorsNamed.filter((item): item is string => typeof item === "string").slice(0, MAX_STORED_COMPETITORS)
      : [],
    answerExcerpt: typeof raw.answerExcerpt === "string" ? raw.answerExcerpt : "",
  };
}

/** Newest successfully-decoded run for this workspace, or null. */
export function latestAeoRun(entries: readonly AuditLog[]): AeoRunRecord | null {
  const runs = entries
    .filter((entry) => entry.action === AEO_RUN_ACTION)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  for (const entry of runs) {
    const decoded = decodeAeoRun(entry.meta?.run);
    if (decoded) return decoded;
  }
  return null;
}
