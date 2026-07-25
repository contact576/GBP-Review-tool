/**
 * Shared QR types.
 *
 * Kept dependency-free on purpose: the data providers import this module (and
 * `./degrade`) to decide degrade behaviour, while `./store` imports the
 * providers. Anything that adds an import back into the data layer here would
 * create a cycle.
 */

/** Subscription fields the QR degrade decision is allowed to read. */
export interface QrSubscriptionSnapshot {
  /** Subscription.status, e.g. "active" | "trialing" | "past_due" | "canceled". */
  status: string | null;
  /** End of the last paid period — the honest start of the grace window. */
  currentPeriodEnd: string | null;
  /** Trial end — the fallback anchor when a trial lapsed without ever billing. */
  trialEndsAt: string | null;
}

/**
 * Everything a public `/q/{slug}` hit needs in order to serve a scan whose
 * asset did NOT mint a session (degraded flag, or a lapsed subscription).
 *
 * Deliberately narrow: resolving it must never require loading a whole
 * workspace dataset, because a churned customer's printed codes can keep
 * taking real traffic for months.
 */
export interface QrScanContext {
  slug: string;
  assetId: string;
  locationId: string;
  /** The stored per-asset degrade flag (an explicit, manual switch). */
  degraded: boolean;
  /** The location's public Google review URL — the degrade destination. */
  reviewUrl: string;
  subscription: QrSubscriptionSnapshot;
}
