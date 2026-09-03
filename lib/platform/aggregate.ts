import { PLANS, normalizePlan } from "@/lib/billing/plans";
import type {
  Channel,
  DeliveryIncident,
  DurabilityRecord,
  FraudTriage,
  PlanTier,
  PlatformCoverage,
  PlatformHistoryRecord,
  PlatformSnapshot,
  PlatformTenant,
  Region,
} from "@/lib/data/types";
import {
  FRAUD_SIGNALS_RUN,
  detectFraud,
  type FraudCustomerRow,
  type FraudRequestRow,
  type FraudReviewRow,
  type FraudStaffRow,
  type FraudUserRow,
} from "./fraud";
import { computeRetention } from "./retention";

/**
 * Platform-wide roll-up for the internal ops console — the pure half.
 *
 * The DB provider fetches flat rows (one per workspace, plus a few grouped
 * counts) and hands them here; this module turns them into the roster and
 * KPIs the console renders. Keeping it pure means every rule below — what
 * counts as MRR, how a tenant's status is chosen across its locations, when a
 * delivery failure becomes an incident — is unit-tested against fixtures
 * rather than against a live database.
 *
 * Honesty rules, in one place:
 *   - MRR counts only subscriptions that are actually being billed (active or
 *     past-due). A trial is $0 until it converts, and so is a paused one.
 *   - A tenant is one organization, however many workspaces it has. Its plan is
 *     its highest, its status its worst (past due beats active beats trial).
 *   - Fraud detection and month-over-month retention are NOT computed here.
 *     They are reported as not covered, so the console shows "Not measured"
 *     for them instead of a reassuring zero.
 */

export interface PlatformWorkspaceRow {
  workspaceId: string;
  organizationId: string;
  organizationName: string;
  locationName: string;
  vertical: string;
  region: string;
  tier: string;
  interval: string;
  status: string;
  ownerEmail: string | null;
  createdAt: string;
}

export interface DeliveryFailureRow {
  workspaceId: string;
  channel: string;
  status: string;
  count: number;
  latestAt: string;
}

export interface DurabilityRow {
  workspaceId: string;
  posted: number;
  survived30d: number;
  survived60d: number;
  vanished: number;
}

/** Raw rows the fraud detectors read (lib/platform/fraud.ts). */
export interface FraudAggregateInput {
  requests: FraudRequestRow[];
  reviews: FraudReviewRow[];
  customers: FraudCustomerRow[];
  staff: FraudStaffRow[];
  users: FraudUserRow[];
  triage: FraudTriage[];
}

export interface PlatformAggregateInput {
  workspaces: PlatformWorkspaceRow[];
  deliveryFailures: DeliveryFailureRow[];
  durability: DurabilityRow[];
  reviewsLast7d: number;
  now: Date;
  /**
   * Omitted → fraud is reported as not covered (the memory provider's demo
   * fixture, and any caller that did not fetch the rows).
   */
  fraud?: FraudAggregateInput;
  /**
   * Stored daily snapshots. Omitted → retention is reported as not covered.
   * With history present but too short, it is still not covered, and the
   * snapshot says how many days exist so the console can say when it will be.
   */
  history?: PlatformHistoryRecord[];
}

const STATUS_RANK: Record<PlatformTenant["status"], number> = {
  past_due: 0,
  active: 1,
  trialing: 2,
  free: 3,
};

const PLAN_RANK: Record<PlanTier, number> = { free: 0, starter: 1, growth: 2, multi: 3, agency: 4 };

/** What one workspace's subscription contributes to MRR, in whole currency units. */
export function workspaceMrr(tier: string, interval: string, status: string): number {
  if (status !== "active" && status !== "past_due") return 0;
  const plan = PLANS[normalizePlan(tier)];
  return interval === "annual" ? plan.priceAnnualMonthly : plan.priceMonthly;
}

function tenantStatus(status: string, tier: PlanTier): PlatformTenant["status"] {
  if (status === "past_due") return "past_due";
  if (status === "trialing") return "trialing";
  if (status === "active" && tier !== "free") return "active";
  return "free";
}

function severityFor(count: number): DeliveryIncident["severity"] {
  if (count >= 20) return "high";
  if (count >= 5) return "medium";
  return "low";
}

const FAILURE_LABEL: Record<string, string> = {
  failed: "Send failures",
  suppressed: "Suppressed sends",
};

/**
 * Accounts created by automated checks against the live deployment. Their
 * owners use reserved test domains, so they can never be customers; keeping
 * them in the roster would inflate every count on the console.
 */
export function isTestAccount(ownerEmail: string | null | undefined): boolean {
  const email = (ownerEmail ?? "").trim().toLowerCase();
  return /@(example\.(com|net|org)|foundly\.invalid|foundly\.local)$/.test(email);
}

export function aggregatePlatform(input: PlatformAggregateInput): PlatformSnapshot {
  const real = input.workspaces.filter((row) => !isTestAccount(row.ownerEmail));
  const testAccountsExcluded = input.workspaces.length - real.length;
  const byOrg = new Map<string, PlatformWorkspaceRow[]>();
  for (const row of real) {
    const list = byOrg.get(row.organizationId) ?? [];
    list.push(row);
    byOrg.set(row.organizationId, list);
  }

  const tenants: PlatformTenant[] = [...byOrg.entries()].map(([organizationId, rows]) => {
    const sorted = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const primary = sorted[0]!;
    let plan: PlanTier = "free";
    let status: PlatformTenant["status"] = "free";
    let mrr = 0;
    for (const row of rows) {
      const tier = normalizePlan(row.tier);
      if (PLAN_RANK[tier] > PLAN_RANK[plan]) plan = tier;
      const rowStatus = tenantStatus(row.status, tier);
      if (STATUS_RANK[rowStatus] < STATUS_RANK[status]) status = rowStatus;
      mrr += workspaceMrr(row.tier, row.interval, row.status);
    }
    return {
      id: organizationId,
      name: primary.organizationName || primary.locationName,
      vertical: primary.vertical,
      plan,
      mrr,
      locations: rows.length,
      status,
      region: (primary.region === "CA" ? "CA" : "US") as Region,
      primaryWorkspaceId: primary.workspaceId,
      ownerEmail: primary.ownerEmail ?? undefined,
      createdAt: primary.createdAt,
    };
  });
  tenants.sort((a, b) => b.mrr - a.mrr || a.name.localeCompare(b.name));

  const nameByWorkspace = new Map(real.map((row) => [row.workspaceId, row.organizationName || row.locationName]));

  const deliveryIncidents: DeliveryIncident[] = input.deliveryFailures
    .filter((row) => row.count > 0 && nameByWorkspace.has(row.workspaceId))
    .map((row) => ({
      id: `di_${row.workspaceId}_${row.channel}_${row.status}`,
      tenant: nameByWorkspace.get(row.workspaceId)!,
      channel: row.channel as Channel,
      type: FAILURE_LABEL[row.status] ?? row.status,
      severity: severityFor(row.count),
      count: row.count,
      at: row.latestAt,
    }))
    .sort((a, b) => b.count - a.count);

  const durability: DurabilityRecord[] = input.durability
    .filter((row) => row.posted > 0 && nameByWorkspace.has(row.workspaceId))
    .map((row) => ({
      id: `dur_${row.workspaceId}`,
      tenant: nameByWorkspace.get(row.workspaceId)!,
      posted: row.posted,
      survived30d: row.survived30d,
      survived60d: row.survived60d,
      vanished: row.vanished,
      filteredRate: Math.round((row.vanished / row.posted) * 1000) / 1000,
    }));

  const paying = tenants.filter((t) => t.status === "active" || t.status === "past_due").length;
  const trialing = tenants.filter((t) => t.status === "trialing").length;

  // Fraud: only when the caller fetched the rows. Signals are scoped to the
  // roster above, so demo, ops and test workspaces can never raise a flag.
  const fraudFlags = input.fraud
    ? detectFraud({ ...input.fraud, tenantNameByWorkspace: nameByWorkspace, now: input.now })
    : [];

  // Retention: needs stored history at least RETENTION_REQUIRED_DAYS old.
  const retention = input.history
    ? computeRetention({ current: tenants, history: input.history, now: input.now })
    : null;

  const coverage: PlatformCoverage = {
    tenants: true,
    billing: true,
    delivery: true,
    durability: true,
    fraud: Boolean(input.fraud),
    ...(input.fraud ? { fraudSignals: FRAUD_SIGNALS_RUN } : {}),
    retention: retention?.measured ?? false,
  };

  return {
    tenants,
    deliveryIncidents,
    fraudFlags,
    durability,
    kpis: {
      totalTenants: tenants.length,
      activeLocations: real.length,
      mrr: tenants.reduce((sum, t) => sum + t.mrr, 0),
      // Share of tenants that are paying, among those paying or still in
      // trial. Not a cohort conversion rate — the console captions it as such.
      trialConversion: paying + trialing > 0 ? paying / (paying + trialing) : 0,
      logoChurn: retention?.logoChurn ?? 0,
      nrr: retention?.nrr ?? 0,
      weeklyDetectedReviews: input.reviewsLast7d,
    },
    measuredAt: input.now.toISOString(),
    coverage,
    testAccountsExcluded,
    ...(retention?.retention ? { retention: retention.retention } : {}),
    ...(retention ? { history: retention.history } : {}),
  };
}
