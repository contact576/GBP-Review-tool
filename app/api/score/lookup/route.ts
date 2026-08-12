import { NextResponse } from "next/server";
import { placesEnabled } from "@/lib/google/config";
import { isPlausibleNameMatch, searchBusinesses } from "@/lib/google/places";
import { boundedString, guardPublicApi, readJsonObject } from "@/lib/security/api";

export const runtime = "nodejs";

/**
 * Free score tool — real-data path. When a Places key is configured, look
 * the business up and return the top match so the score uses the actual
 * public rating/review count. Without a key: `{ ok: true, real: false }`
 * and the tool stays on its clearly-labelled synthetic preview.
 */
export async function POST(req: Request) {
  const limited = guardPublicApi(req, "score-lookup", 20, 60_000);
  if (limited) return limited;
  let business = "";
  let category = "";
  try {
    const body = await readJsonObject(req, 8_192);
    business = boundedString(body.business, 160);
    category = boundedString(body.category, 120);
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

  // Text Search ranks against the whole query, category included, and always
  // returns its best effort — so a name it never really matched still comes
  // back looking authoritative. Searching "Priority Plumbing & Drains Toronto"
  // with the category select untouched returned "Tru Physiotherapy" (5.0, 87
  // reviews), which the tool then showed as the caller's own listing. Match the
  // hit against the name the user actually typed, never the augmented query,
  // and fall back to the clearly-labelled synthetic preview when it does not
  // hold up. Showing an estimate beats stating someone else's numbers as fact.
  const match = result.places.find((place) => isPlausibleNameMatch(business, place.name));
  if (!match) {
    return NextResponse.json({ ok: true, real: false });
  }

  return NextResponse.json({ ok: true, real: true, place: match });
}
