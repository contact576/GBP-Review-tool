import "server-only";

import { NextResponse } from "next/server";
import { getSession, type Session, type SessionRole } from "@/lib/auth/session";

interface RateBucket {
  count: number;
  resetAt: number;
}

const runtimeState = globalThis as unknown as {
  __foundlyApiRateBuckets?: Map<string, RateBucket>;
};

function buckets(): Map<string, RateBucket> {
  runtimeState.__foundlyApiRateBuckets ??= new Map<string, RateBucket>();
  return runtimeState.__foundlyApiRateBuckets;
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

/**
 * Per-instance abuse protection. This closes the immediate unbounded-cost path;
 * a durable distributed limiter can replace the store without changing routes.
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

  return NextResponse.json(
    { error: "rate_limited" },
    { status: 429, headers: { "retry-after": String(result.retryAfter) } },
  );
}

export function consumeRateLimit(
  scope: string,
  subject: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const store = buckets();
  if (store.size > 5_000) {
    for (const [key, bucket] of store) {
      if (bucket.resetAt <= now) store.delete(key);
    }
  }

  const key = `${scope}:${subject}`;
  const current = store.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;

  bucket.count += 1;
  store.set(key, bucket);
  return {
    allowed: bucket.count <= limit,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
  };
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

  const limited = guardPublicApi(
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
