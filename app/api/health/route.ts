import { NextResponse } from "next/server";
import { hasAiKey } from "@/lib/ai/model";
import { isDbBacked } from "@/lib/data";

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
    aiKeyed: hasAiKey(),
    dbBacked: isDbBacked(),
    time: new Date().toISOString(),
  };

  const url = new URL(req.url);
  if (url.searchParams.get("deep") !== "1") return NextResponse.json(base);

  const now = Date.now();
  if (throttle.__foundlyDeepCheckAt && now - throttle.__foundlyDeepCheckAt < 60_000) {
    return NextResponse.json({ ...base, deep: "throttled" });
  }
  throttle.__foundlyDeepCheckAt = now;

  const [ai, places, db] = await Promise.all([probeAi(), probePlaces(), probeDb()]);
  return NextResponse.json({ ...base, deep: { ai, places, db } });
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

async function probePlaces(): Promise<{ ok: boolean; detail?: string; error?: string }> {
  if (!process.env.GOOGLE_MAPS_API_KEY) return { ok: false, error: "key_not_set" };
  try {
    const { searchBusinesses } = await import("@/lib/google/places");
    const result = await searchBusinesses("Starbucks Toronto", "CA");
    if (result.ok && result.places.length > 0) {
      const first = result.places[0];
      return { ok: true, detail: first ? first.name : "results" };
    }
    return { ok: false, error: result.ok ? "no_results" : "lookup_failed" };
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
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
    const rows = (await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'app_user'`) as Array<{ column_name: string }>;
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
