"use server";

import { ensureSchema } from "@/lib/db/ensure";

/** One-click DB init — idempotent DDL, safe to run repeatedly. */
export async function initDbAction(): Promise<{ ok: boolean; error?: string }> {
  const result = await ensureSchema();
  return { ok: result.ok, error: result.error };
}

/** Tiny live AI probe (~20 tokens) to prove the key works. */
export async function testAiAction(): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "Key not set" };
  try {
    const { completeText } = await import("@/lib/ai/client");
    const { getModel } = await import("@/lib/ai/model");
    const text = await completeText({
      model: getModel(),
      system: "Reply with exactly: ok",
      user: "ping",
      maxTokens: 8,
    });
    return text
      ? { ok: true }
      : { ok: false, error: "The AI didn't respond — check the key and billing at console.anthropic.com" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Test failed" };
  }
}

/** Live Places probe — one cheap text search. */
export async function testPlacesAction(): Promise<{ ok: boolean; detail?: string; error?: string }> {
  if (!process.env.GOOGLE_MAPS_API_KEY) return { ok: false, error: "Key not set" };
  try {
    const { searchBusinesses } = await import("@/lib/google/places");
    const result = await searchBusinesses("Starbucks Toronto", "CA");
    if (result.ok && result.places.length > 0) {
      const first = result.places[0];
      return { ok: true, detail: first ? first.name : "results returned" };
    }
    return {
      ok: false,
      error:
        result.ok
          ? "No results — key may lack Places API (New) access"
          : `Lookup failed — enable "Places API (New)" on the key in Google Cloud`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Test failed" };
  }
}
