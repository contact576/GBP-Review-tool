import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { hasAiKey } from "@/lib/ai/model";
import { getSession } from "@/lib/auth/session";
import { isDbBacked } from "@/lib/data";
import { guardPublicApi } from "@/lib/security/api";

export const runtime = "nodejs";

/**
 * Health endpoint. Plain GET returns config booleans only. `?deep=1` also
 * runs live probes (tiny AI ping, one Places search, DB connectivity) so the
 * setup checklist can be verified remotely. Deep probes are throttled per
 * instance because the AI ping is a (very small) paid call.
 */
const throttle = globalThis as unknown as { __foundlyDeepCheckAt?: number };

export async function GET(req: Request) {
  const base = {
    ok: true,
    service: "foundly",
    time: new Date().toISOString(),
  };

  const url = new URL(req.url);
  if (url.searchParams.get("deep") !== "1") return NextResponse.json(base);

  if (!(await canRunDeepHealth(req))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const limited = guardPublicApi(req, "deep-health", 5, 60_000, "authorized");
  if (limited) return limited;

  const now = Date.now();
  if (throttle.__foundlyDeepCheckAt && now - throttle.__foundlyDeepCheckAt < 60_000) {
    return NextResponse.json({ ...base, deep: "throttled" });
  }
  throttle.__foundlyDeepCheckAt = now;

  const [ai, places, db] = await Promise.all([probeAi(), probePlaces(), probeDb()]);
  return NextResponse.json({
    ...base,
    configuration: {
      aiKeyed: hasAiKey(),
      openAiKeyed: Boolean(process.env.OPENAI_API_KEY),
      dbBacked: isDbBacked(),
      monitoringConfigured: Boolean(process.env.CRON_SECRET && process.env.DATABASE_URL),
      assetSigningConfigured: Boolean(process.env.CONTENT_ASSET_SIGNING_SECRET || process.env.AUTH_SECRET),
    },
    deep: { ai, places, db },
  });
}

async function canRunDeepHealth(req: Request): Promise<boolean> {
  const configured = process.env.HEALTH_CHECK_SECRET;
  const presented = req.headers.get("x-foundly-health-secret");
  if (configured && presented) {
    const expected = Buffer.from(configured);
    const actual = Buffer.from(presented);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return true;
  }

  const session = await getSession();
  return session?.role === "platform_admin";
}

async function probeAi(): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "key_not_set" };
  try {
    const { completeText } = await import("@/lib/ai/client");
    const { getModel } = await import("@/lib/ai/model");
    const text = await completeText({
      model: getModel(),
      system: "Reply with exactly: ok",
      user: "ping",
      maxTokens: 8,
    });
    return text ? { ok: true } : { ok: false, error: "no_response" };
  } catch {
    return { ok: false, error: "request_failed" };
  }
}

async function probePlaces(): Promise<{
  ok: boolean;
  detail?: string;
  rating?: number;
  reviewCount?: number;
  sampleReviews?: number;
  error?: string;
}> {
  if (!process.env.GOOGLE_MAPS_API_KEY) return { ok: false, error: "key_not_set" };
  try {
    const { searchBusinesses, getPlaceDetails } = await import("@/lib/google/places");
    const result = await searchBusinesses("Starbucks Toronto", "CA");
    if (!result.ok || result.places.length === 0) {
      return { ok: false, error: result.ok ? "no_results" : "lookup_failed" };
    }
    const first = result.places[0];
    if (!first) return { ok: false, error: "no_results" };
    // Exercise the exact Place Details path syncGooglePublic uses.
    const details = await getPlaceDetails(first.placeId);
    if (!details.ok) return { ok: true, detail: first.name, error: `details_${details.reason}` };
    return {
      ok: true,
      detail: details.details.name,
      rating: details.details.rating,
      reviewCount: details.details.reviewCount,
      sampleReviews: details.details.reviews.length,
    };
  } catch {
    return { ok: false, error: "request_failed" };
  }
}

async function probeDb(): Promise<{
  ok: boolean;
  schemaReady?: boolean;
  accountColumnsOk?: boolean;
  missingAccountColumns?: string[];
  error?: string;
}> {
  if (!process.env.DATABASE_URL) return { ok: false, error: "not_set" };
  try {
    const { checkDatabase } = await import("@/lib/db/ensure");
    const db = await checkDatabase();
    if (!db.reachable) return { ok: false, error: db.error };

    // Confirm the account table has every column registration/login write —
    // proves the auth fix works against the live schema (column names only).
    const { getSql } = await import("@/lib/db/client");
    const sql = getSql();
    const rows = (await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'app_user'`) as unknown as Array<{ column_name: string }>;
    const have = new Set(rows.map((r) => r.column_name));
    const required = ["password_hash", "email_verified", "google_sub", "created_at"];
    const missing = required.filter((c) => !have.has(c));

    return {
      ok: true,
      schemaReady: db.schemaReady,
      accountColumnsOk: missing.length === 0,
      missingAccountColumns: missing,
    };
  } catch {
    return { ok: false, error: "check_failed" };
  }
}
