import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** AI-authored customer review generation has been permanently retired. */
export async function POST() {
  return NextResponse.json(
    { error: "customer_review_generation_retired", use: "/api/ai/review-edit" },
    { status: 410 },
  );
}
