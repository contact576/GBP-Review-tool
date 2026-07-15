import { NextResponse } from "next/server";
import { placesEnabled } from "@/lib/google/config";
import { searchBusinesses } from "@/lib/google/places";

export const runtime = "nodejs";

/**
 * Free score tool — real-data path. When a Places key is configured, look
 * the business up and return the top match so the score uses the actual
 * public rating/review count. Without a key: `{ ok: true, real: false }`
 * and the tool stays on its clearly-labelled synthetic preview.
 */
export async function POST(req: Request) {
  let business = "";
  let category = "";
  try {
    const body = (await req.json()) as { business?: unknown; category?: unknown };
    business = typeof body.business === "string" ? body.business.trim() : "";
    category = typeof body.category === "string" ? body.category.trim() : "";
  } catch {
    return NextResponse.json({ ok: true, real: false });
  }

  if (!business || !placesEnabled()) {
    return NextResponse.json({ ok: true, real: false });
  }

  const result = await searchBusinesses(
    category && category !== "Other local business" ? `${business} ${category}` : business,
  );
  if (!result.ok || !result.places[0]) {
    return NextResponse.json({ ok: true, real: false });
  }

  return NextResponse.json({ ok: true, real: true, place: result.places[0] });
}
