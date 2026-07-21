import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Retained as an explicit compatibility boundary. Foundly no longer generates
 * sample customer reviews; callers must use the authentic customer-authored
 * review experience instead.
 */
export async function POST() {
  return NextResponse.json(
    { error: "customer_review_generation_retired" },
    { status: 410 },
  );
}
