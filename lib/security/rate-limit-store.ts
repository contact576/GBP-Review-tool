import "server-only";

import { logServerError } from "@/lib/observability/log";

/**
 * Pluggable rate-limit store.
 *
 * WHY: on Vercel every request may land on a different serverless instance, so
 * a process-local `Map` counts only the slice of traffic that happened to reach
 * that instance. With N warm instances a "30 per minute" limit is really
 * "30 x N per minute", which is not a limit at all on the expensive paths
 * (AI generation, the public free-score lookup, the public review page).
 *
 * There are two implementations behind one interface:
 *
 *  - `UpstashRateLimitStore` — real fleet-wide counting over the Upstash Redis
 *    REST API using plain `fetch` (no npm dependency, same style as
 *    lib/billing/stripe.ts). A single atomic `EVAL` does INCR + PEXPIRE + PTTL.
 *    Active when BOTH `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
 *    are set.
 *
 *  - `MemoryRateLimitStore` — the previous per-process `Map`. HONEST LIMITATION:
 *    this is per-instance only and therefore does NOT enforce anything across
 *    the fleet. It is a cost brake on a single hot instance, not a security
 *    control. Selecting it logs one loud, structured event per instance
 *    (`rate_limit_not_distributed`) so the gap is visible in the log drain
 *    instead of being silently assumed away.
 *
 * Availability beats enforcement: every distributed call is wrapped so that a
 * Redis outage falls back to in-memory counting (fail OPEN) rather than locking
 * users out. A rate limiter outage must not become an availability outage.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the current window resets (>= 1). */
  retryAfter: number;
  /** Requests counted in the current window, including this one. */
  count: number;
  /** Epoch ms at which the current window resets. */
  resetAt: number;
}

export interface RateLimitStore {
  readonly kind: "memory" | "upstash";
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision>;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

interface StoreBreaker {
  failures: number;
  /** While `now < openUntil` the distributed store is skipped entirely. */
  openUntil: number;
  lastLoggedAt: number;
}

/**
 * State lives on `globalThis` so module duplication (dev HMR, multiple bundles)
 * cannot fragment the buckets. The key is unchanged from the original
 * implementation so behaviour is identical when no store is configured.
 */
const runtimeState = globalThis as unknown as {
  __foundlyApiRateBuckets?: Map<string, RateBucket>;
  __foundlyRateLimitStore?: RateLimitStore;
  __foundlyRateLimitNotices?: Set<string>;
  __foundlyRateLimitBreaker?: StoreBreaker;
};

/** Consecutive failures before the store is skipped (avoids latency pile-up). */
const BREAKER_THRESHOLD = 3;
/** How long the breaker stays open before probing the store again. */
const BREAKER_COOLDOWN_MS = 10_000;
/** Never log the same store failure more often than this. */
const FAILURE_LOG_INTERVAL_MS = 60_000;
/** Upstash calls are bounded so a hung Redis cannot hold a request open. */
const DEFAULT_TIMEOUT_MS = 1_000;
/** Namespacing keeps limiter keys from colliding with anything else in Redis. */
const KEY_PREFIX = "foundly:rl:";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function buckets(): Map<string, RateBucket> {
  runtimeState.__foundlyApiRateBuckets ??= new Map<string, RateBucket>();
  return runtimeState.__foundlyApiRateBuckets;
}

function breaker(): StoreBreaker {
  runtimeState.__foundlyRateLimitBreaker ??= { failures: 0, openUntil: 0, lastLoggedAt: 0 };
  return runtimeState.__foundlyRateLimitBreaker;
}

function retryAfterSeconds(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1_000));
}

/** Emit a structured event at most once per instance for `id`. */
function noticeOnce(id: string, error: Error, context: Record<string, string | number | boolean>): void {
  runtimeState.__foundlyRateLimitNotices ??= new Set<string>();
  if (runtimeState.__foundlyRateLimitNotices.has(id)) return;
  runtimeState.__foundlyRateLimitNotices.add(id);
  logServerError(error, { event: id, ...context });
}

// ── In-memory (per-instance) counting ───────────────────────

/**
 * Synchronous single-instance counter. This is the fallback path AND the
 * fast path that keeps `consumeRateLimit` callable from synchronous code.
 */
export function memoryConsume(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitDecision {
  const store = buckets();
  if (store.size > 5_000) {
    for (const [existing, bucket] of store) {
      if (bucket.resetAt <= now) store.delete(existing);
    }
  }

  const current = store.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;

  bucket.count += 1;
  store.set(key, bucket);
  return {
    allowed: bucket.count <= limit,
    retryAfter: retryAfterSeconds(bucket.resetAt, now),
    count: bucket.count,
    resetAt: bucket.resetAt,
  };
}

/**
 * Fold an authoritative fleet-wide count back into the local bucket.
 *
 * The distributed count already includes this instance's own increment, so the
 * merge is `max()` (never a sum) — this converges the local view onto the truth
 * without double counting. Used by the synchronous path, which cannot await the
 * store: it decides from local state now and learns the fleet total a moment
 * later, so the very next request on this instance sees fleet-wide numbers.
 */
export function adoptDistributedCount(
  key: string,
  decision: Pick<RateLimitDecision, "count" | "resetAt">,
  now: number = Date.now(),
): void {
  if (decision.resetAt <= now) return; // window already gone; nothing to learn
  const store = buckets();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: decision.count, resetAt: decision.resetAt });
    return;
  }
  if (decision.count > current.count) current.count = decision.count;
  if (decision.resetAt > current.resetAt) current.resetAt = decision.resetAt;
}

export class MemoryRateLimitStore implements RateLimitStore {
  readonly kind = "memory" as const;

  consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    return Promise.resolve(memoryConsume(key, limit, windowMs));
  }
}

// ── Upstash Redis REST (fleet-wide) counting ────────────────

/**
 * Atomic fixed-window counter. INCR creates the key at 1; the TTL is (re)armed
 * on creation or if the key somehow lost its expiry, so a key can never leak.
 * Returning the TTL lets the caller compute an accurate `retry-after`.
 */
const CONSUME_SCRIPT = `local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if hits == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {hits, ttl}`;

export class UpstashRateLimitStore implements RateLimitStore {
  readonly kind = "upstash" as const;
  private readonly url: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(url: string, token: string, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.url = url.replace(/\/+$/, "");
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  /** Throws on any transport/protocol failure so callers can fail open. */
  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const ttlMs = Math.max(1, Math.round(windowMs));
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["EVAL", CONSUME_SCRIPT, "1", `${KEY_PREFIX}${key}`, String(ttlMs)]),
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const payload = (await res.json()) as { result?: unknown; error?: string } | null;
    if (!res.ok) {
      throw new Error(payload?.error ?? `upstash ${res.status}`);
    }
    if (!payload || typeof payload !== "object" || typeof payload.error === "string") {
      throw new Error(payload?.error ?? "upstash returned an error");
    }

    const result = payload.result;
    if (!Array.isArray(result) || result.length < 2) {
      throw new Error("upstash returned an unexpected shape");
    }
    const count = Number(result[0]);
    const ttl = Number(result[1]);
    if (!Number.isFinite(count) || !Number.isFinite(ttl)) {
      throw new Error("upstash returned a non-numeric counter");
    }

    const now = Date.now();
    const resetAt = now + (ttl > 0 ? ttl : ttlMs);
    return {
      allowed: count <= limit,
      retryAfter: retryAfterSeconds(resetAt, now),
      count,
      resetAt,
    };
  }
}

// ── Store selection + health ────────────────────────────────

export function distributedRateLimitConfigured(): boolean {
  return Boolean(env("UPSTASH_REDIS_REST_URL") && env("UPSTASH_REDIS_REST_TOKEN"));
}

/**
 * Resolve (and cache) the store for this instance. Selecting the memory
 * fallback is logged once, loudly: an unenforceable limiter is a real
 * production condition, not a detail to hide.
 */
export function getRateLimitStore(): RateLimitStore {
  const cached = runtimeState.__foundlyRateLimitStore;
  if (cached) return cached;

  const url = env("UPSTASH_REDIS_REST_URL");
  const token = env("UPSTASH_REDIS_REST_TOKEN");
  const store: RateLimitStore = url && token
    ? new UpstashRateLimitStore(url, token)
    : new MemoryRateLimitStore();

  if (store.kind === "memory") {
    noticeOnce(
      "rate_limit_not_distributed",
      new Error(
        "Rate limiting is per-instance only: no UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN " +
          "is configured, so limits are NOT enforced across the serverless fleet. Each instance " +
          "counts its own traffic, meaning the effective limit is roughly (limit x live instances).",
      ),
      { store: "memory", distributed: false, remediation: "set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN" },
    );
  }

  runtimeState.__foundlyRateLimitStore = store;
  return store;
}

/** False while the breaker is open after repeated distributed-store failures. */
export function storeAvailable(now: number = Date.now()): boolean {
  return breaker().openUntil <= now;
}

export function noteStoreSuccess(): void {
  const state = breaker();
  state.failures = 0;
  state.openUntil = 0;
}

/**
 * Record a distributed-store failure. Trips the breaker after repeated errors
 * and logs at most once a minute so an outage cannot flood the drain.
 */
export function noteStoreFailure(
  error: unknown,
  context: Record<string, string | number | boolean>,
  now: number = Date.now(),
): void {
  const state = breaker();
  state.failures += 1;
  if (state.failures >= BREAKER_THRESHOLD) {
    state.openUntil = now + BREAKER_COOLDOWN_MS;
  }
  if (state.lastLoggedAt > 0 && now - state.lastLoggedAt < FAILURE_LOG_INTERVAL_MS) return;
  state.lastLoggedAt = now;
  logServerError(error, {
    event: "rate_limit_store_unavailable",
    ...context,
    failures: state.failures,
    // Explicit: we chose availability over enforcement for this call.
    fallback: "in-memory per-instance counting (fail open)",
  });
}

/** Snapshot for health/diagnostics: is the limiter actually fleet-wide right now? */
export function rateLimiterStatus(now: number = Date.now()): {
  store: RateLimitStore["kind"];
  distributed: boolean;
  degraded: boolean;
} {
  const store = getRateLimitStore();
  const available = storeAvailable(now);
  return {
    store: store.kind,
    distributed: store.kind === "upstash" && available,
    degraded: store.kind === "memory" || !available,
  };
}

/** Test-only: drop cached store, buckets, breaker state and once-per-instance notices. */
export function __resetRateLimitStateForTests(): void {
  runtimeState.__foundlyApiRateBuckets = new Map<string, RateBucket>();
  delete runtimeState.__foundlyRateLimitStore;
  runtimeState.__foundlyRateLimitNotices = new Set<string>();
  runtimeState.__foundlyRateLimitBreaker = { failures: 0, openUntil: 0, lastLoggedAt: 0 };
}
