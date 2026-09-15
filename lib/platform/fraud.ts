import type { FraudFlag, FraudSignalKind, FraudTriage } from "@/lib/data/types";

/**
 * Capture-fraud detection for the ops console — the pure half.
 *
 * Two detectors run against data the platform actually holds; a third is
 * declared but not run, and the console says so:
 *
 *   velocity_anomaly   A tenant whose captured (request-matched) Google
 *                      reviews in the last 24h are far above its own 30-day
 *                      baseline, or a burst of review requests sent inside one
 *                      hour. Both are the classic shape of incentivised or
 *                      bulk review solicitation.
 *   staff_self_review  A "customer" who is really a member of the tenant's
 *                      own team — same email as a workspace login, or the
 *                      same name as a staff member — and was sent a review
 *                      request (or, worse, posted).
 *   same_device        NOT RUN. The customer review flow collects no device
 *                      fingerprint, so nothing can be said about it. It is
 *                      reported as not covered rather than silently clean.
 *
 * Flag ids are deterministic (tenant + signal + the thing that tripped it), so
 * an operator's triage decision — stored against the id — re-applies on every
 * recompute instead of resurfacing the same flag every morning.
 */

export interface FraudRequestRow {
  workspaceId: string;
  id: string;
  customerId: string;
  staffId: string | null;
  status: string;
  createdAt: string;
  isTest: boolean;
}

export interface FraudReviewRow {
  workspaceId: string;
  publishedAt: string;
  matchedRequestId: string | null;
}

export interface FraudCustomerRow {
  workspaceId: string;
  id: string;
  name: string;
  email: string | null;
}

export interface FraudStaffRow {
  workspaceId: string;
  id: string;
  displayName: string;
}

export interface FraudUserRow {
  workspaceId: string;
  email: string;
}

export interface FraudDetectInput {
  requests: FraudRequestRow[];
  reviews: FraudReviewRow[];
  customers: FraudCustomerRow[];
  staff: FraudStaffRow[];
  users: FraudUserRow[];
  /** Tenant display name per workspace; workspaces not in the map are skipped. */
  tenantNameByWorkspace: Map<string, string>;
  triage: FraudTriage[];
  now: Date;
}

/** Which detectors this module actually runs. */
export const FRAUD_SIGNALS_RUN: Record<FraudSignalKind, boolean> = {
  velocity_anomaly: true,
  staff_self_review: true,
  same_device: false,
};

// ── Thresholds (named so the console can quote them) ──────────────────────
export const VELOCITY_MIN_REVIEWS_24H = 5;
export const VELOCITY_BASELINE_MULTIPLIER = 4;
export const VELOCITY_BASELINE_DAYS = 30;
export const BURST_MIN_REQUESTS_PER_HOUR = 30;
export const BURST_LOOKBACK_DAYS = 7;

const HOUR = 3_600_000;
const DAY = 86_400_000;

function severityForVelocity(count: number): FraudFlag["severity"] {
  if (count >= 15) return "high";
  if (count >= 8) return "medium";
  return "low";
}

function severityForBurst(count: number): FraudFlag["severity"] {
  return count >= 2 * BURST_MIN_REQUESTS_PER_HOUR ? "high" : "medium";
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k) ?? [];
    list.push(row);
    out.set(k, list);
  }
  return out;
}

/**
 * Captured-review velocity: reviews matched to a request, last 24h, against
 * the tenant's own daily average over the prior 30 days.
 */
export function detectReviewVelocity(
  reviews: FraudReviewRow[],
  tenant: string,
  workspaceId: string,
  now: Date,
): FraudFlag | null {
  const nowMs = now.getTime();
  const matched = reviews.filter((review) => review.matchedRequestId);
  const last24h = matched.filter((review) => {
    const at = new Date(review.publishedAt).getTime();
    return at > nowMs - DAY && at <= nowMs;
  }).length;
  if (last24h < VELOCITY_MIN_REVIEWS_24H) return null;
  const baselineWindow = matched.filter((review) => {
    const at = new Date(review.publishedAt).getTime();
    return at > nowMs - (VELOCITY_BASELINE_DAYS + 1) * DAY && at <= nowMs - DAY;
  }).length;
  const baselinePerDay = Math.max(baselineWindow / VELOCITY_BASELINE_DAYS, 0.5);
  if (last24h < VELOCITY_BASELINE_MULTIPLIER * baselinePerDay) return null;
  const day = now.toISOString().slice(0, 10);
  return {
    id: `ff_${workspaceId}_velocity_reviews_${day}`,
    workspaceId,
    tenant,
    kind: "velocity_anomaly",
    detail: `${last24h} captured Google reviews in 24h against a ${baselinePerDay.toFixed(1)}/day baseline over the prior ${VELOCITY_BASELINE_DAYS} days`,
    severity: severityForVelocity(last24h),
    at: now.toISOString(),
  };
}

/** A burst: at least BURST_MIN_REQUESTS_PER_HOUR real requests inside one hour. */
export function detectRequestBurst(
  requests: FraudRequestRow[],
  tenant: string,
  workspaceId: string,
  now: Date,
): FraudFlag | null {
  const nowMs = now.getTime();
  const times = requests
    .filter((request) => !request.isTest)
    .map((request) => new Date(request.createdAt).getTime())
    .filter((at) => Number.isFinite(at) && at > nowMs - BURST_LOOKBACK_DAYS * DAY && at <= nowMs)
    .sort((a, b) => a - b);
  let best = { count: 0, start: 0 };
  let head = 0;
  for (let tail = 0; tail < times.length; tail += 1) {
    while (times[tail]! - times[head]! > HOUR) head += 1;
    const count = tail - head + 1;
    if (count > best.count) best = { count, start: times[head]! };
  }
  if (best.count < BURST_MIN_REQUESTS_PER_HOUR) return null;
  const startIso = new Date(best.start).toISOString();
  return {
    id: `ff_${workspaceId}_velocity_burst_${startIso.slice(0, 13)}`,
    workspaceId,
    tenant,
    kind: "velocity_anomaly",
    detail: `${best.count} review requests sent within one hour starting ${startIso.slice(0, 16).replace("T", " ")} UTC`,
    severity: severityForBurst(best.count),
    at: startIso,
  };
}

/**
 * A customer record that is really the tenant's own team, and was asked for a
 * review. One flag per customer; severity rises with how far the request got.
 */
export function detectStaffSelfReview(
  input: {
    requests: FraudRequestRow[];
    customers: FraudCustomerRow[];
    staff: FraudStaffRow[];
    users: FraudUserRow[];
  },
  tenant: string,
  workspaceId: string,
): FraudFlag[] {
  const teamEmails = new Set(input.users.map((user) => user.email.trim().toLowerCase()).filter(Boolean));
  const staffNames = new Map(input.staff.map((member) => [normalizeName(member.displayName), member.displayName]));
  const requestsByCustomer = groupBy(
    input.requests.filter((request) => !request.isTest),
    (request) => request.customerId,
  );
  const flags: FraudFlag[] = [];
  for (const customer of input.customers) {
    const requests = requestsByCustomer.get(customer.id);
    if (!requests?.length) continue;
    const email = customer.email?.trim().toLowerCase() ?? "";
    const byEmail = Boolean(email) && teamEmails.has(email);
    const byName = staffNames.get(normalizeName(customer.name));
    if (!byEmail && !byName) continue;
    const posted = requests.some((request) => request.status === "posted_google");
    const engaged = requests.some((request) => request.status === "opened" || request.status === "clicked");
    const latest = requests.map((request) => request.createdAt).sort().pop()!;
    const who = byEmail ? "a workspace login's email" : `staff member ${byName}`;
    flags.push({
      id: `ff_${workspaceId}_self_${customer.id}`,
      workspaceId,
      tenant,
      kind: "staff_self_review",
      detail: posted
        ? `Customer "${customer.name}" matches ${who} and a Google review was captured from their request`
        : `Customer "${customer.name}" matches ${who} and was sent ${requests.length} review request${requests.length === 1 ? "" : "s"}`,
      severity: posted ? "high" : engaged ? "medium" : "low",
      at: latest,
    });
  }
  return flags;
}

const SEV_RANK: Record<FraudFlag["severity"], number> = { high: 0, medium: 1, low: 2 };

export function detectFraud(input: FraudDetectInput): FraudFlag[] {
  const requestsByWs = groupBy(input.requests, (row) => row.workspaceId);
  const reviewsByWs = groupBy(input.reviews, (row) => row.workspaceId);
  const customersByWs = groupBy(input.customers, (row) => row.workspaceId);
  const staffByWs = groupBy(input.staff, (row) => row.workspaceId);
  const usersByWs = groupBy(input.users, (row) => row.workspaceId);
  const triageById = new Map(input.triage.map((entry) => [entry.flagId, entry]));

  const flags: FraudFlag[] = [];
  for (const [workspaceId, tenant] of input.tenantNameByWorkspace) {
    const requests = requestsByWs.get(workspaceId) ?? [];
    const velocity = detectReviewVelocity(reviewsByWs.get(workspaceId) ?? [], tenant, workspaceId, input.now);
    if (velocity) flags.push(velocity);
    const burst = detectRequestBurst(requests, tenant, workspaceId, input.now);
    if (burst) flags.push(burst);
    flags.push(
      ...detectStaffSelfReview(
        {
          requests,
          customers: customersByWs.get(workspaceId) ?? [],
          staff: staffByWs.get(workspaceId) ?? [],
          users: usersByWs.get(workspaceId) ?? [],
        },
        tenant,
        workspaceId,
      ),
    );
  }
  return flags
    .map((flag) => {
      const triage = triageById.get(flag.id);
      return triage ? { ...flag, triage } : flag;
    })
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.at.localeCompare(a.at));
}
