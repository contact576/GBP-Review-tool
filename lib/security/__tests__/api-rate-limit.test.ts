import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeRateLimit,
  consumeRateLimitDistributed,
  guardPublicApi,
  guardPublicApiAsync,
} from "@/lib/security/api";
import { __resetRateLimitStateForTests } from "@/lib/security/rate-limit-store";

const REDIS_URL = "https://example-redis.upstash.io";
const REDIS_TOKEN = "test-token";

const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

function enableRedis(): void {
  process.env.UPSTASH_REDIS_REST_URL = REDIS_URL;
  process.env.UPSTASH_REDIS_REST_TOKEN = REDIS_TOKEN;
  __resetRateLimitStateForTests();
}

/** A Redis stand-in: one shared counter per key, as the real fleet would see. */
function fakeRedis(ttlMs = 60_000): { fetch: ReturnType<typeof vi.fn>; counts: Map<string, number> } {
  const counts = new Map<string, number>();
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as string[];
    const key = String(body[3]);
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    return new Response(JSON.stringify({ result: [next, ttlMs] }), { status: 200 });
  });
  return { fetch: fetchMock, counts };
}

/**
 * A same-origin POST. The Origin header is required, not incidental:
 * `guardPublicApi` rejects a cross-origin state-changing request with 403
 * before it ever reaches the rate limiter, so a request without one would
 * exercise the CSRF guard rather than the limits these tests are about.
 */
function request(url = "https://app.foundly.test/api/score/lookup"): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "x-real-ip": "203.0.113.9",
      origin: new URL(url).origin,
    },
  });
}

beforeEach(() => {
  __resetRateLimitStateForTests();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
  if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
});

describe("consumeRateLimit (synchronous, memory fallback)", () => {
  it("stays synchronous so existing call sites keep working", () => {
    const result = consumeRateLimit("ai-content-preview", "user_1", 2, 60_000);
    expect(result).toEqual({ allowed: true, retryAfter: 60 });
    // Not a promise: server actions call this without await.
    expect(typeof (result as unknown as { then?: unknown }).then).toBe("undefined");
  });

  it("enforces the limit and isolates identities", () => {
    expect(consumeRateLimit("s", "a", 1, 60_000).allowed).toBe(true);
    expect(consumeRateLimit("s", "a", 1, 60_000).allowed).toBe(false);
    expect(consumeRateLimit("s", "b", 1, 60_000).allowed).toBe(true);
  });

  it("resets after the window expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(consumeRateLimit("s", "a", 1, 60_000).allowed).toBe(true);
    expect(consumeRateLimit("s", "a", 1, 60_000).allowed).toBe(false);
    vi.setSystemTime(new Date("2026-01-01T00:01:01Z"));
    expect(consumeRateLimit("s", "a", 1, 60_000).allowed).toBe(true);
  });

  it("makes no network call when no distributed store is configured", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    consumeRateLimit("s", "a", 5, 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("consumeRateLimit (synchronous, Upstash configured)", () => {
  it("increments the shared counter in the background", async () => {
    enableRedis();
    const redis = fakeRedis();
    vi.stubGlobal("fetch", redis.fetch);

    consumeRateLimit("score-lookup", "203.0.113.9", 5, 60_000);
    await vi.waitFor(() => expect(redis.fetch).toHaveBeenCalledTimes(1));
    expect(redis.counts.get("foundly:rl:score-lookup:203.0.113.9")).toBe(1);
  });

  it("adopts the fleet total, so traffic on other instances counts here too", async () => {
    enableRedis();
    const redis = fakeRedis();
    // Simulate 4 hits already recorded by other instances in this window.
    redis.counts.set("foundly:rl:score-lookup:203.0.113.9", 4);
    vi.stubGlobal("fetch", redis.fetch);

    // First local call decides from local state (allowed) but reconciles to 5.
    expect(consumeRateLimit("score-lookup", "203.0.113.9", 5, 60_000).allowed).toBe(true);
    await vi.waitFor(() => expect(redis.fetch).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0)); // let the reconcile land

    // The next call on this instance now sees the fleet-wide count and blocks,
    // even though this instance has only served one prior request.
    expect(consumeRateLimit("score-lookup", "203.0.113.9", 5, 60_000).allowed).toBe(false);
  });

  it("fails open (and logs) when the store is unreachable", async () => {
    enableRedis();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    vi.stubGlobal("fetch", fetchMock);

    // Requests are still served from the local bucket — no lockout.
    for (let i = 0; i < 3; i += 1) {
      expect(consumeRateLimit("score-lookup", "ip", 5, 60_000).allowed).toBe(true);
    }
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(payload.event).toBe("rate_limit_store_unavailable");
    expect(payload.scope).toBe("score-lookup");

    // Breaker opened: further calls skip Redis instead of adding latency.
    const callsBefore = fetchMock.mock.calls.length;
    consumeRateLimit("score-lookup", "ip", 5, 60_000);
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });
});

describe("consumeRateLimitDistributed (strict)", () => {
  it("enforces one shared limit across simulated instances", async () => {
    enableRedis();
    const redis = fakeRedis();
    vi.stubGlobal("fetch", redis.fetch);

    const decisions = [];
    for (let i = 0; i < 4; i += 1) {
      decisions.push(await consumeRateLimitDistributed("ai", "user_1", 3, 60_000));
    }
    expect(decisions.map((d) => d.allowed)).toEqual([true, true, true, false]);
    expect(decisions[3]?.retryAfter).toBe(60);
  });

  it("keeps per-identity isolation through the shared store", async () => {
    enableRedis();
    vi.stubGlobal("fetch", fakeRedis().fetch);
    expect((await consumeRateLimitDistributed("ai", "user_1", 1, 60_000)).allowed).toBe(true);
    expect((await consumeRateLimitDistributed("ai", "user_1", 1, 60_000)).allowed).toBe(false);
    expect((await consumeRateLimitDistributed("ai", "user_2", 1, 60_000)).allowed).toBe(true);
  });

  it("falls back to in-memory counting when the store errors", async () => {
    enableRedis();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("gateway timeout", { status: 504 })));

    // Fail open: allowed, and still counted locally so the brake is not gone.
    expect((await consumeRateLimitDistributed("ai", "user_1", 2, 60_000)).allowed).toBe(true);
    expect((await consumeRateLimitDistributed("ai", "user_1", 2, 60_000)).allowed).toBe(true);
    expect((await consumeRateLimitDistributed("ai", "user_1", 2, 60_000)).allowed).toBe(false);
  });

  it("uses memory directly when no store is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await consumeRateLimitDistributed("ai", "user_1", 1, 60_000)).allowed).toBe(true);
    expect((await consumeRateLimitDistributed("ai", "user_1", 1, 60_000)).allowed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("guardPublicApi", () => {
  it("returns null while under the limit and a 429 with retry-after past it", () => {
    expect(guardPublicApi(request(), "score-lookup", 1, 60_000)).toBeNull();
    const blocked = guardPublicApi(request(), "score-lookup", 1, 60_000);
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("retry-after")).toBe("60");
  });

  it("rejects cross-origin requests before spending a token", () => {
    const req = new Request("https://app.foundly.test/api/score/lookup", {
      method: "POST",
      headers: { origin: "https://evil.test", "x-real-ip": "203.0.113.9" },
    });
    expect(guardPublicApi(req, "score-lookup", 5, 60_000)?.status).toBe(403);
  });

  it("scopes by caller IP", () => {
    const other = new Request("https://app.foundly.test/api/score/lookup", {
      method: "POST",
      headers: { origin: "https://app.foundly.test", "x-real-ip": "198.51.100.4" },
    });
    expect(guardPublicApi(request(), "score-lookup", 1, 60_000)).toBeNull();
    expect(guardPublicApi(request(), "score-lookup", 1, 60_000)?.status).toBe(429);
    expect(guardPublicApi(other, "score-lookup", 1, 60_000)).toBeNull();
  });
});

describe("guardPublicApiAsync", () => {
  it("enforces the shared limit and still answers 429 with retry-after", async () => {
    enableRedis();
    vi.stubGlobal("fetch", fakeRedis(30_000).fetch);
    expect(await guardPublicApiAsync(request(), "review-edit", 1, 60_000)).toBeNull();
    const blocked = await guardPublicApiAsync(request(), "review-edit", 1, 60_000);
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("retry-after")).toBe("30");
  });

  it("does not lock anyone out when Redis is down", async () => {
    enableRedis();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    expect(await guardPublicApiAsync(request(), "review-edit", 5, 60_000)).toBeNull();
    expect(await guardPublicApiAsync(request(), "review-edit", 5, 60_000)).toBeNull();
  });
});
