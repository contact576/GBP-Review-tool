import { NextResponse } from "next/server";
import { generateScoreSample } from "@/lib/ai/generate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const standing =
      body.standing === "strong" || body.standing === "average" || body.standing === "weak"
        ? body.standing
        : undefined;
    const rating = Number.isFinite(Number(body.rating)) && body.rating != null
      ? Number(body.rating)
      : undefined;
    const result = await generateScoreSample({
      business: String(body.business ?? "the business"),
      category: String(body.category ?? "local business"),
      standing,
      rating,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
