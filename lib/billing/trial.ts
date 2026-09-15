/**
 * Trial lifecycle, read at request time. Pure — no clock other than the `now`
 * you pass, no I/O — so every gate in the app answers "is this trial still
 * live?" from one place instead of each re-deriving it from `status`.
 *
 * Why this exists: a sign-up writes `status: "trialing"` and `trialEndsAt`,
 * and nothing ever flips the row afterwards. Any gate that reads
 * `status === "trialing"` alone therefore stays unlocked forever. Everything
 * below treats the end date as the source of truth and the status as the
 * claim it qualifies.
 */

import { PLANS, TRIAL_DAYS, effectivePlan, hasFeature, normalizePlan, type Feature, type PlanId } from "./plans";
import type { Subscription } from "@/lib/data/types";

export type TrialSubscription = Pick<Subscription, "status" | "trialEndsAt">;

export type TrialPhase =
  /** Live trial with more than TRIAL_ENDING_SOON_DAYS left. */
  | "trialing"
  /** Live trial in its last few days. */
  | "ending_soon"
  /** `status` still says trialing but the end date has passed. */
  | "expired"
  /** A paid subscription (active, or past_due but not yet lapsed). */
  | "paid"
  /** Free, canceled, paused — no trial in play. */
  | "none";

export interface TrialState {
  phase: TrialPhase;
  /** Whole days until the trial ends (0 once it has). */
  daysLeft: number;
  /** Whole days since the trial ended (0 unless expired). */
  daysSinceEnd: number;
  /** The stored end timestamp, when there is a parseable one. */
  endsAt: string | null;
}

/** "Ending soon" begins this many days before the end date, inclusive. */
export const TRIAL_ENDING_SOON_DAYS = 3;

const DAY_MS = 86_400_000;

const PAID_STATUSES: ReadonlySet<Subscription["status"]> = new Set(["active", "past_due"]);

function parseEnd(iso: string | undefined): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : time;
}

export function trialState(subscription: TrialSubscription, now: Date = new Date()): TrialState {
  const endTime = parseEnd(subscription.trialEndsAt);
  const endsAt = endTime === null ? null : (subscription.trialEndsAt ?? null);
  const base = { daysLeft: 0, daysSinceEnd: 0, endsAt };

  if (PAID_STATUSES.has(subscription.status)) return { ...base, phase: "paid" };
  if (subscription.status !== "trialing") return { ...base, phase: "none" };
  // A trialing row with no usable end date cannot be expired by anyone. It is
  // treated as freshly started rather than silently locked or silently eternal
  // — both would be a lie the UI can't explain.
  if (endTime === null) return { ...base, phase: "trialing", daysLeft: TRIAL_DAYS };

  const remaining = endTime - now.getTime();
  if (remaining < 0) {
    return { ...base, phase: "expired", daysSinceEnd: Math.floor(-remaining / DAY_MS) };
  }
  const daysLeft = Math.ceil(remaining / DAY_MS);
  return {
    ...base,
    phase: daysLeft <= TRIAL_ENDING_SOON_DAYS ? "ending_soon" : "trialing",
    daysLeft,
  };
}

/** `status` is trialing and the end date is in the past. */
export function isTrialExpired(subscription: TrialSubscription, now: Date = new Date()): boolean {
  return trialState(subscription, now).phase === "expired";
}

/**
 * The workspace has run out its trial and has nothing paid behind it. A paid
 * status can never be "expired" (see `trialState`), but the guard is spelled
 * out so a future status can't unlock the app by accident.
 */
export function trialLocked(subscription: TrialSubscription, now: Date = new Date()): boolean {
  return isTrialExpired(subscription, now) && !PAID_STATUSES.has(subscription.status);
}

/**
 * The `trialing` argument every `hasFeature` / `effectivePlan` call should
 * pass: true only while the trial is actually live. Replaces the bare
 * `status === "trialing"` reads, which never expired.
 */
export function trialUnlocks(subscription: TrialSubscription, now: Date = new Date()): boolean {
  if (subscription.status !== "trialing") return false;
  return !isTrialExpired(subscription, now);
}

/**
 * The plan a workspace is actually entitled to right now.
 *
 * Sign-ups store `tier: "growth"` alongside `status: "trialing"` — the tier
 * records which plan the trial *was*, not what the workspace has paid for. So
 * once the trial expires the stored tier must not count: a locked workspace
 * is entitled to Free until it pays or explicitly continues on Free.
 */
export function entitledPlan(
  subscription: Pick<Subscription, "status" | "trialEndsAt" | "tier">,
  now: Date = new Date(),
): PlanId {
  if (trialLocked(subscription, now)) return "free";
  return effectivePlan(normalizePlan(subscription.tier), trialUnlocks(subscription, now));
}

/**
 * The one feature gate. Every page, action, and route that used to call
 * `hasFeature(tier, feature, status === "trialing")` goes through here so an
 * expired trial is locked everywhere at once.
 */
export function subscriptionHasFeature(
  subscription: Pick<Subscription, "status" | "trialEndsAt" | "tier">,
  feature: Feature,
  now: Date = new Date(),
): boolean {
  if (trialLocked(subscription, now)) return PLANS.free.features.includes(feature);
  return hasFeature(normalizePlan(subscription.tier), feature, trialUnlocks(subscription, now));
}

// ── Route lock ──────────────────────────────────────────────

/**
 * Routes an owner can still reach while their expired trial is locked: the
 * page that explains it, everything under settings (billing lives there), and
 * their customers — so they can always pay or take their data with them.
 */
export const TRIAL_LOCK_ALLOWED_PREFIXES: readonly string[] = [
  "/app/trial-ending",
  "/app/settings",
  "/app/customers",
];

export function trialLockAllowsPath(pathname: string): boolean {
  return TRIAL_LOCK_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export interface TrialLockSessionInput {
  role: "owner" | "manager" | "staff" | "agency_admin" | "platform_admin";
  /** An agency/platform admin working inside another workspace (`homeWorkspaceId` set). */
  acting: boolean;
  isDemo: boolean;
}

/**
 * Whether this session, in this workspace, should be redirected off the app.
 * Only the owner is sent to the trial-ending page — they are the one who can
 * pay. Acting admins keep working (their own subscription is the one that
 * matters), the demo never locks, and agency-tier workspaces are never
 * trial-locked (their trial, if any, is a Stripe one with a card behind it).
 */
export function shouldTrialLock(
  session: TrialLockSessionInput,
  subscription: Pick<Subscription, "status" | "trialEndsAt" | "tier">,
  now: Date = new Date(),
): boolean {
  if (session.isDemo) return false;
  if (session.acting) return false;
  if (session.role !== "owner") return false;
  if (normalizePlan(subscription.tier) === "agency") return false;
  return trialLocked(subscription, now);
}

// ── Copy shared by the trial-ending page and the trial emails ───────────────

/** What a workspace keeps on Free, forever. */
export const TRIAL_FREE_KEEPS: readonly string[] = [
  "Your QR codes & review link — always live",
  "Monthly Local Growth Score email",
  "5 AI review drafts every month",
  '"Reviews powered by Foundly" badge',
];

/** What pauses on Free until a paid plan switches it back on. */
export const TRIAL_PAUSES_ON_FREE: readonly string[] = [
  "GBP Co-Pilot weekly tasks",
  "Benchmark & competitor tracking",
  "Campaigns & automations",
  "Rank Grid & AI Visibility scans",
];
