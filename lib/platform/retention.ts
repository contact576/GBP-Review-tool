import type {
  PlatformHistoryRecord,
  PlatformHistoryStatus,
  PlatformRetention,
  PlatformSnapshot,
  PlatformTenant,
} from "@/lib/data/types";

/**
 * Month-over-month retention for the ops console — the pure half.
 *
 * Logo churn and net revenue retention are comparisons, and a comparison
 * needs a "then". The platform keeps one snapshot per UTC day (the
 * `platform_snapshot` table, written by the daily cron and by the console
 * itself); this module picks the snapshot closest to a month ago and measures
 * today's tenants against it.
 *
 *   logo churn = paying tenants then that are not paying now ÷ paying then
 *   NRR        = today's MRR of the tenants that were paying then ÷ their MRR then
 *
 * Until enough history exists the numbers are simply not produced — the
 * console renders "Not measured" with how many days remain, never a 0% churn
 * it has not actually observed.
 */

/** Snapshots must span at least this many days before retention is computed. */
export const RETENTION_REQUIRED_DAYS = 28;

/** The ideal lookback; the closest stored day that is old enough is used. */
export const RETENTION_LOOKBACK_DAYS = 30;

const DAY = 86_400_000;

const PAYING: ReadonlySet<PlatformTenant["status"]> = new Set(["active", "past_due"]);

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Build the record for today from a computed snapshot. Idempotent per day. */
export function historyRecordFrom(snapshot: PlatformSnapshot, now: Date): PlatformHistoryRecord {
  const day = utcDay(now);
  return {
    id: `ph_${day}`,
    day,
    capturedAt: now.toISOString(),
    tenants: snapshot.tenants.map((tenant) => ({
      id: tenant.id,
      mrr: tenant.mrr,
      status: tenant.status,
      plan: tenant.plan,
    })),
    kpis: {
      totalTenants: snapshot.kpis.totalTenants,
      activeLocations: snapshot.kpis.activeLocations,
      mrr: snapshot.kpis.mrr,
    },
  };
}

export function historyStatus(history: PlatformHistoryRecord[]): PlatformHistoryStatus {
  const days = [...new Set(history.map((record) => record.day))].sort();
  return {
    days: days.length,
    firstAt: days[0],
    latestAt: days[days.length - 1],
    requiredDays: RETENTION_REQUIRED_DAYS,
  };
}

function dayMs(day: string): number {
  return new Date(`${day}T00:00:00Z`).getTime();
}

/**
 * The comparison snapshot: the stored day closest to RETENTION_LOOKBACK_DAYS
 * ago that is at least RETENTION_REQUIRED_DAYS old. Null when history is too
 * short — the caller then reports "not measured".
 */
export function pickPriorSnapshot(
  history: PlatformHistoryRecord[],
  now: Date,
): PlatformHistoryRecord | null {
  const nowMs = now.getTime();
  const oldEnough = history.filter((record) => nowMs - dayMs(record.day) >= RETENTION_REQUIRED_DAYS * DAY);
  if (!oldEnough.length) return null;
  const target = nowMs - RETENTION_LOOKBACK_DAYS * DAY;
  return oldEnough.reduce((best, record) =>
    Math.abs(dayMs(record.day) - target) < Math.abs(dayMs(best.day) - target) ? record : best,
  );
}

export interface RetentionResult {
  measured: boolean;
  logoChurn: number;
  nrr: number;
  retention?: PlatformRetention;
  history: PlatformHistoryStatus;
}

export function computeRetention(input: {
  current: Pick<PlatformTenant, "id" | "mrr" | "status">[];
  history: PlatformHistoryRecord[];
  now: Date;
}): RetentionResult {
  const history = historyStatus(input.history);
  const prior = pickPriorSnapshot(input.history, input.now);
  if (!prior) return { measured: false, logoChurn: 0, nrr: 0, history };

  const nowById = new Map(input.current.map((tenant) => [tenant.id, tenant]));
  const priorPaying = prior.tenants.filter((tenant) => PAYING.has(tenant.status));
  let churned = 0;
  let retainedMrr = 0;
  for (const then of priorPaying) {
    const today = nowById.get(then.id);
    if (!today || !PAYING.has(today.status)) churned += 1;
    else retainedMrr += today.mrr;
  }
  const priorMrr = priorPaying.reduce((sum, tenant) => sum + tenant.mrr, 0);
  const retention: PlatformRetention = {
    priorAt: prior.capturedAt,
    priorPaying: priorPaying.length,
    churned,
    priorMrr,
    retainedMrr,
  };
  return {
    measured: true,
    logoChurn: priorPaying.length ? churned / priorPaying.length : 0,
    nrr: priorMrr ? retainedMrr / priorMrr : 0,
    retention,
    history,
  };
}
