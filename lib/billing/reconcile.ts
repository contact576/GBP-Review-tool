import type { PlanTier, Subscription } from "@/lib/data/types";

type SubscriptionPatch = Partial<
  Pick<
    Subscription,
    | "status"
    | "tier"
    | "interval"
    | "stripeCustomerId"
    | "stripeSubscriptionId"
    | "stripePriceId"
    | "currentPeriodEnd"
    | "cancelAtPeriodEnd"
  >
>;

export interface StripeReconciliation {
  workspaceId: string;
  patch: SubscriptionPatch;
}

type PriceResolver = (
  priceId: string,
) => { tier: Exclude<PlanTier, "free">; interval: "monthly" | "annual" } | null;

type JsonRecord = Record<string, unknown>;

const PAID_TIERS = new Set<PlanTier>(["starter", "growth", "pro", "multi", "agency"]);

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function expandableId(value: unknown): string | undefined {
  return string(value) ?? string(record(value).id);
}

function paidTier(value: unknown): Exclude<PlanTier, "free"> | undefined {
  return typeof value === "string" && PAID_TIERS.has(value as PlanTier)
    ? (value as Exclude<PlanTier, "free">)
    : undefined;
}

function interval(value: unknown): "monthly" | "annual" | undefined {
  if (value === "monthly" || value === "annual") return value;
  if (value === "month") return "monthly";
  if (value === "year") return "annual";
  return undefined;
}

function isoFromUnix(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return new Date(value * 1_000).toISOString();
}

function subscriptionStatus(value: unknown, deleted: boolean): Subscription["status"] {
  if (deleted || value === "canceled") return "canceled";
  if (value === "active") return "active";
  if (value === "trialing") return "trialing";
  if (value === "paused") return "paused";
  return "past_due";
}

/**
 * Convert a verified Stripe event into the smallest tenant-scoped subscription
 * update. This stays pure so webhook behavior is deterministic and testable.
 */
export function reconcileStripeEvent(
  input: unknown,
  resolvePrice: PriceResolver,
): StripeReconciliation | null {
  const event = record(input);
  const eventType = string(event.type);
  const object = record(record(event.data).object);
  if (!eventType || Object.keys(object).length === 0) return null;

  const metadata = record(object.metadata);
  const workspaceId = string(metadata.workspaceId) ?? string(object.client_reference_id);
  if (!workspaceId || !/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId)) return null;

  if (eventType === "checkout.session.completed") {
    const patch: SubscriptionPatch = {};
    const customerId = expandableId(object.customer);
    const subscriptionId = expandableId(object.subscription);
    const tier = paidTier(metadata.tier);
    const cadence = interval(metadata.interval);
    if (customerId) patch.stripeCustomerId = customerId;
    if (subscriptionId) patch.stripeSubscriptionId = subscriptionId;
    if (tier) patch.tier = tier;
    if (cadence) patch.interval = cadence;
    return Object.keys(patch).length ? { workspaceId, patch } : null;
  }

  const subscriptionEvents = new Set([
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
  ]);
  if (!subscriptionEvents.has(eventType)) return null;

  const items = record(object.items);
  const item = Array.isArray(items.data) ? record(items.data[0]) : {};
  const price = record(item.price);
  const priceId = expandableId(item.price);
  const mapped = priceId ? resolvePrice(priceId) : null;
  const recurring = record(price.recurring);
  const tier = mapped?.tier ?? paidTier(metadata.tier);
  const cadence = mapped?.interval ?? interval(metadata.interval) ?? interval(recurring.interval);
  const currentPeriodEnd =
    isoFromUnix(object.current_period_end) ?? isoFromUnix(item.current_period_end);
  const customerId = expandableId(object.customer);
  const subscriptionId = expandableId(object.id);

  const status = subscriptionStatus(
      eventType === "customer.subscription.resumed" ? "active" : object.status,
      eventType === "customer.subscription.deleted",
    );
  const patch: SubscriptionPatch = {
    status,
    cancelAtPeriodEnd: object.cancel_at_period_end === true,
  };
  if (customerId) patch.stripeCustomerId = customerId;
  if (subscriptionId) patch.stripeSubscriptionId = subscriptionId;
  if (priceId) patch.stripePriceId = priceId;
  if (status === "canceled") patch.tier = "free";
  else if (tier) patch.tier = tier;
  if (cadence) patch.interval = cadence;
  if (currentPeriodEnd) patch.currentPeriodEnd = currentPeriodEnd;
  return { workspaceId, patch };
}
