import { NextResponse } from "next/server";
import { searchBusinesses } from "@/lib/google/places";

export const runtime = "nodejs";

/**
 * Real business lookup for client components (they never touch the API key).
 * Keyless environments get `{ ok: false, reason: "no_key" }` with HTTP 200 —
 * an expected state the UI turns into an honest fallback, not an error.
 */
export async function POST(req: Request) {
  let query = "";
  let region: "US" | "CA" = "US";
  try {
    const body = (await req.json()) as { query?: unknown; region?: unknown };
    query = typeof body.query === "string" ? body.query : "";
    if (body.region === "CA") region = "CA";
  } catch {
    return NextResponse.json(
      { ok: false, reason: "error", detail: "Invalid request body" },
      { status: 400 },
    );
  }

  const result = await searchBusinesses(query, region);
  return NextResponse.json(result);
}
