/**
 * Metering for AI-Visibility runs.
 *
 * Each run is N model calls that cost real money, so the ceiling is enforced in
 * two independent places:
 *
 *  1. A short-window abuse guard on the route (lib/security/api's
 *     `guardAuthenticatedApi`) stops rapid-fire clicking.
 *  2. A DURABLE monthly quota counted from the workspace's own audit log, so a
 *     restart, a second browser tab or a different instance cannot reset it.
 *
 * The numbers here are also what the UI displays — cost visibility and the
 * enforced limit are read from the same source.
 */

import type { AuditLog } from "@/lib/data/types";
import type { PlanId } from "@/lib/billing/plans";
import { AEO_RUN_ACTION } from "./persistence";

/** Runs per calendar month, by plan. Multi/Agency manage more locations. */
export function monthlyRunLimit(tier: PlanId): number {
  return tier === "multi" || tier === "agency" ? 12 : 4;
}

export function currentMonthKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function countRunsInMonth(entries: readonly AuditLog[], month: string): number {
  return entries.filter((entry) => entry.action === AEO_RUN_ACTION && entry.at.startsWith(month))
    .length;
}

export interface AeoQuota {
  month: string;
  used: number;
  limit: number;
  remaining: number;
  /** ISO date the counter rolls over. */
  resetsOn: string;
}

export function aeoQuota(
  entries: readonly AuditLog[],
  tier: PlanId,
  now: Date = new Date(),
): AeoQuota {
  const month = currentMonthKey(now);
  const limit = monthlyRunLimit(tier);
  const used = countRunsInMonth(entries, month);
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    month,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsOn: reset.toISOString(),
  };
}
