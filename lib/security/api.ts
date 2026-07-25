import "server-only";

import { NextResponse } from "next/server";
import { getSession, type Session, type SessionRole } from "@/lib/auth/session";
import {
  adoptDistributedCount,
  getRateLimitStore,
  memoryConsume,
  noteStoreFailure,
  noteStoreSuccess,
  storeAvailable,
} from "@/lib/security/rate-limit-store";

/**
 * Request guards for API routes and server actions.
 *
 * Rate limiting is delegated to lib/security/rate-limit-store, which is
 * distributed (Upstash Redis over REST) when `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN` are set, and per-instance-only otherwise. The
 * per-instance mode is NOT enforcement across a serverless fleet and says so in
 * the logs — see that module's header. Store errors fail open by design.
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
}

function rateLimitKey(scope: string, subject: string): string {
  return `${scope}:${subject}`;
}

/**
 * Fire-and-forget fleet-wide increment for the synchronous path.
 *
 * `consumeRateLimit` and `guardPublicApi` are called synchronously from route
 * handlers and server actions that this module does not own, so the decision
 * cannot await Redis. Instead the local counter decides now and the shared
 * counter is incremented in the background; when it resolves, the authoritative
 * fleet total is merged into the local bucket (see `adoptDistributedCount`).
 *
 * Consequence, stated plainly: the synchronous path is eventually consistent.
 * An instance can let through the requests already in flight before its first
 * reconcile lands, so the effective ceiling is `limit + in-flight`, not
 * `limit x instances` as before. Callers that can `await` should use
 * `consumeRateLimitDistributed` / `guardPublicApiAsync`, which are strict.
 *
 * Second caveat, also stated plainly: a serverless instance may be frozen once
 * its response is sent, so an occasional in-flight INCR can be dropped. The
 * request is already out on the wire by then, so Redis normally still applies
 * it; the reconcile is best-effort, not a guarantee.
 */
function scheduleDistributedReconcile(key: string, limit: number, windowMs: number, scope: string): void {
  const store = getRateLimitStore();
  if (store.kind === "memory" || !storeAvailable()) return;
  void store.consume(key, limit, windowMs).then(
    (decision) => {
      noteStoreSuccess();
      adoptDistributedCount(key, decision);
    },
    (error: unknown) => {
      noteStoreFailure(error, { scope, mode: "async-reconcile" });
    },
  );
}

function requestIdentity(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

function rateLimitedResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "rate_limited" },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}

/**
 * Origin + abuse guard for public routes. SYNCHRONOUS — kept that way because
 * route handlers outside this module call it without `await`.
 *
 * Backed by lib/security/rate-limit-store: when Upstash is configured the count
 * is shared across the fleet (eventually consistent — see
 * `scheduleDistributedReconcile`); otherwise it is per-instance only and that
 * gap is logged once per instance rather than silently assumed away.
 * `guardPublicApiAsync` is the strict, await-based equivalent.
 */
export function guardPublicApi(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number,
  subject?: string,
): NextResponse | null {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  }

  const result = consumeRateLimit(scope, subject || requestIdentity(req), limit, windowMs);
  if (result.allowed) return null;
  return rateLimitedResponse(result.retryAfter);
}

/**
 * Strictly distributed variant: awaits the shared counter before deciding, so
 * the limit holds across instances with no in-flight slack. Falls back to
 * in-memory counting (fail open) if the store is unreachable.
 */
export async function guardPublicApiAsync(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number,
  subject?: string,
): Promise<NextResponse | null> {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  }

  const result = await consumeRateLimitDistributed(
    scope,
    subject || requestIdentity(req),
    limit,
    windowMs,
  );
  if (result.allowed) return null;
  return rateLimitedResponse(result.retryAfter);
}

/**
 * Consume one token. SYNCHRONOUS — the signature is unchanged so existing
 * server actions and routes keep working untouched.
 *
 * With Upstash configured this also increments the shared counter in the
 * background and folds the fleet total back into the local bucket, so limits
 * converge on fleet-wide truth within a request. Without it, this is exactly
 * the old per-instance behaviour, and the store logs that fact once.
 */
export function consumeRateLimit(
  scope: string,
  subject: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const key = rateLimitKey(scope, subject);
  const decision = memoryConsume(key, limit, windowMs);
  scheduleDistributedReconcile(key, limit, windowMs, scope);
  return { allowed: decision.allowed, retryAfter: decision.retryAfter };
}

/**
 * Await-based consume with strict fleet-wide enforcement.
 *
 * Fail-open contract: any store error (network, timeout, bad response) is
 * logged and answered from the in-memory bucket instead. A limiter outage must
 * degrade protection, never availability.
 */
export async function consumeRateLimitDistributed(
  scope: string,
  subject: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const key = rateLimitKey(scope, subject);
  const store = getRateLimitStore();

  if (store.kind === "memory" || !storeAvailable()) {
    const decision = memoryConsume(key, limit, windowMs);
    return { allowed: decision.allowed, retryAfter: decision.retryAfter };
  }

  try {
    const decision = await store.consume(key, limit, windowMs);
    noteStoreSuccess();
    // Keep the local bucket warm so a later fail-open call starts from truth.
    adoptDistributedCount(key, decision);
    return { allowed: decision.allowed, retryAfter: decision.retryAfter };
  } catch (error) {
    noteStoreFailure(error, { scope, mode: "await" });
    const decision = memoryConsume(key, limit, windowMs);
    return { allowed: decision.allowed, retryAfter: decision.retryAfter };
  }
}

export async function guardAuthenticatedApi(
  req: Request,
  options: {
    scope: string;
    roles: SessionRole[];
    limit?: number;
    windowMs?: number;
  },
): Promise<
  | { ok: true; session: Session }
  | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  if (!options.roles.includes(session.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  // Already async, and every caller awaits it — so this path gets the strict
  // distributed check. It fronts the expensive AI generation routes.
  const limited = await guardPublicApiAsync(
    req,
    options.scope,
    options.limit ?? 30,
    options.windowMs ?? 60_000,
    `${session.userId}:${requestIdentity(req)}`,
  );
  if (limited) return { ok: false, response: limited };
  return { ok: true, session };
}

export async function readJsonObject(
  req: Request,
  maxBytes = 16_384,
): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("payload_too_large");
  }
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    throw new Error("payload_too_large");
  }
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_json_object");
  }
  return parsed as Record<string, unknown>;
}

export function boundedString(value: unknown, max: number, fallback = ""): string {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

export function boundedStrings(
  value: unknown,
  maxItems: number,
  maxItemLength: number,
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .map((item) => boundedString(item, maxItemLength))
    .filter(Boolean);
}

export function boundedNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
