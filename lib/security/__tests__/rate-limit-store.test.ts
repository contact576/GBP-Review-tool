import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UpstashRateLimitStore,
  __resetRateLimitStateForTests,
  adoptDistributedCount,
  distributedRateLimitConfigured,
  getRateLimitStore,
  memoryConsume,
  noteStoreFailure,
  noteStoreSuccess,
  rateLimiterStatus,
  storeAvailable,
} from "@/lib/security/rate-limit-store";

const REDIS_URL = "https://example-redis.upstash.io";
const REDIS_TOKEN = "test-token";

function withRedisEnv(): void {
  process.env.UPSTASH_REDIS_REST_URL = REDIS_URL;
  process.env.UPSTASH_REDIS_REST_TOKEN = REDIS_TOKEN;
}

function withoutRedisEnv(): void {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
}

function upstashResponse(hits: number, ttlMs: number): Response {
  return new Response(JSON.stringify({ result: [hits, ttlMs] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

beforeEach(() => {
  __resetRateLimitStateForTests();
  withoutRedisEnv();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
  if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
});

describe("memory store", () => {
  it("enforces the limit inside a window", () => {
    const results = Array.from({ length: 4 }, () => memoryConsume("scope:ip", 3, 60_000, 1_000));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.count)).toEqual([1, 2, 3, 4]);
  });

  it("resets once the window expires", () => {
    expect(memoryConsume("scope:ip", 1, 60_000, 1_000).allowed).toBe(true);
    expect(memoryConsume("scope:ip", 1, 60_000, 30_000).allowed).toBe(false);
    // Boundary: exactly at resetAt the bucket is stale and starts over.
    const afterExpiry = memoryConsume("scope:ip", 1, 60_000, 61_000);
    expect(afterExpiry.allowed).toBe(true);
    expect(afterExpiry.count).toBe(1);
  });

  it("reports retry-after in whole seconds, never below one", () => {
    const decision = memoryConsume("scope:ip", 1, 60_000, 1_000);
    expect(decision.retryAfter).toBe(60);
    expect(memoryConsume("scope:ip", 1, 60_000, 60_500).retryAfter).toBe(1);
  });

  it("isolates counters per identity and per scope", () => {
    memoryConsume("scope:alice", 1, 60_000, 1_000);
    expect(memoryConsume("scope:alice", 1, 60_000, 1_000).allowed).toBe(false);
    expect(memoryConsume("scope:bob", 1, 60_000, 1_000).allowed).toBe(true);
    expect(memoryConsume("other-scope:alice", 1, 60_000, 1_000).allowed).toBe(true);
  });
});

describe("adoptDistributedCount", () => {
  it("raises the local counter to the fleet total without double counting", () => {
    memoryConsume("scope:ip", 10, 60_000, 1_000); // local count = 1
    adoptDistributedCount("scope:ip", { count: 7, resetAt: 61_000 }, 1_000);
    expect(memoryConsume("scope:ip", 10, 60_000, 1_000).count).toBe(8);
  });

  it("never lowers a local counter below what this instance has seen", () => {
    memoryConsume("scope:ip", 10, 60_000, 1_000);
    memoryConsume("scope:ip", 10, 60_000, 1_000);
    memoryConsume("scope:ip", 10, 60_000, 1_000);
    adoptDistributedCount("scope:ip", { count: 1, resetAt: 61_000 }, 1_000);
    expect(memoryConsume("scope:ip", 10, 60_000, 1_000).count).toBe(4);
  });

  it("seeds a bucket when the instance has no live window", () => {
    adoptDistributedCount("scope:new", { count: 5, resetAt: 61_000 }, 1_000);
    expect(memoryConsume("scope:new", 10, 60_000, 1_000).count).toBe(6);
  });

  it("ignores a fleet window that has already expired", () => {
    adoptDistributedCount("scope:stale", { count: 99, resetAt: 500 }, 1_000);
    expect(memoryConsume("scope:stale", 10, 60_000, 1_000).count).toBe(1);
  });
});

describe("store selection", () => {
  it("falls back to memory and logs the gap exactly once per instance", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(distributedRateLimitConfigured()).toBe(false);
    expect(getRateLimitStore().kind).toBe("memory");
    expect(getRateLimitStore().kind).toBe("memory");

    expect(spy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(payload.event).toBe("rate_limit_not_distributed");
    expect(payload.distributed).toBe(false);
    expect(String(payload.message)).toContain("NOT enforced across the serverless fleet");
    expect(rateLimiterStatus()).toEqual({ store: "memory", distributed: false, degraded: true });
  });

  it("uses Upstash when both env vars are present, with no warning log", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    withRedisEnv();
    expect(distributedRateLimitConfigured()).toBe(true);
    expect(getRateLimitStore().kind).toBe("upstash");
    expect(spy).not.toHaveBeenCalled();
    expect(rateLimiterStatus()).toEqual({ store: "upstash", distributed: true, degraded: false });
  });

  it("requires BOTH env vars — a half-configured store is not distributed", () => {
    process.env.UPSTASH_REDIS_REST_URL = REDIS_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(distributedRateLimitConfigured()).toBe(false);
    expect(getRateLimitStore().kind).toBe("memory");
  });
});

describe("UpstashRateLimitStore", () => {
  it("sends one atomic EVAL and maps the reply to a decision", async () => {
    const fetchMock = vi.fn(async () => upstashResponse(3, 42_000));
    vi.stubGlobal("fetch", fetchMock);

    const store = new UpstashRateLimitStore(`${REDIS_URL}/`, REDIS_TOKEN);
    const decision = await store.consume("score-lookup:1.2.3.4", 5, 60_000);

    expect(decision.allowed).toBe(true);
    expect(decision.count).toBe(3);
    expect(decision.retryAfter).toBe(42);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // Trailing slash normalised away.
    expect(url).toBe(REDIS_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${REDIS_TOKEN}`);

    const body = JSON.parse(String(init.body)) as string[];
    expect(body[0]).toBe("EVAL");
    expect(body[1]).toContain("INCR");
    expect(body[1]).toContain("PEXPIRE");
    expect(body[2]).toBe("1");
    expect(body[3]).toBe("foundly:rl:score-lookup:1.2.3.4");
    expect(body[4]).toBe("60000");
  });

  it("denies once the fleet-wide count passes the limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstashResponse(6, 30_000)));
    const decision = await new UpstashRateLimitStore(REDIS_URL, REDIS_TOKEN).consume("s:k", 5, 60_000);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfter).toBe(30);
  });

  it("uses the full window when Redis reports no TTL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstashResponse(1, -1)));
    const decision = await new UpstashRateLimitStore(REDIS_URL, REDIS_TOKEN).consume("s:k", 5, 60_000);
    expect(decision.retryAfter).toBe(60);
  });

  it("throws on an HTTP error so the caller can fail open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "WRONGPASS" }), { status: 401 })),
    );
    await expect(
      new UpstashRateLimitStore(REDIS_URL, REDIS_TOKEN).consume("s:k", 5, 60_000),
    ).rejects.toThrow("WRONGPASS");
  });

  it("throws on an unexpected payload shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ result: "nope" }), { status: 200 })),
    );
    await expect(
      new UpstashRateLimitStore(REDIS_URL, REDIS_TOKEN).consume("s:k", 5, 60_000),
    ).rejects.toThrow("unexpected shape");
  });

  it("throws when the network call fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    await expect(
      new UpstashRateLimitStore(REDIS_URL, REDIS_TOKEN).consume("s:k", 5, 60_000),
    ).rejects.toThrow("ECONNREFUSED");
  });
});

describe("failure breaker", () => {
  it("stays closed for isolated failures and opens after repeated ones", () => {
    expect(storeAvailable(1_000)).toBe(true);
    noteStoreFailure(new Error("boom"), { scope: "s" }, 1_000);
    expect(storeAvailable(1_000)).toBe(true);
    noteStoreFailure(new Error("boom"), { scope: "s" }, 1_100);
    noteStoreFailure(new Error("boom"), { scope: "s" }, 1_200);
    expect(storeAvailable(1_300)).toBe(false);
    // And closes again after the cooldown so Redis is retried.
    expect(storeAvailable(1_200 + 10_001)).toBe(true);
  });

  it("resets after a success", () => {
    noteStoreFailure(new Error("boom"), { scope: "s" }, 1_000);
    noteStoreFailure(new Error("boom"), { scope: "s" }, 1_100);
    noteStoreFailure(new Error("boom"), { scope: "s" }, 1_200);
    noteStoreSuccess();
    expect(storeAvailable(1_300)).toBe(true);
  });

  it("logs a fail-open event but not once per failed request", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    noteStoreFailure(new Error("boom"), { scope: "score-lookup" }, 1_000);
    noteStoreFailure(new Error("boom"), { scope: "score-lookup" }, 2_000);
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(payload.event).toBe("rate_limit_store_unavailable");
    expect(payload.fallback).toContain("fail open");
    // A later failure past the interval is logged again.
    noteStoreFailure(new Error("boom"), { scope: "score-lookup" }, 1_000 + 60_001);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
