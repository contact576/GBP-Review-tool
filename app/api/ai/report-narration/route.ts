import { NextResponse } from "next/server";
import { generateReportNarration } from "@/lib/ai/generate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await generateReportNarration({
      business: String(body.business ?? "the business"),
      foundYou: Number(body.foundYou ?? 0),
      foundDelta: Number(body.foundDelta ?? 0),
      contactedYou: Number(body.contactedYou ?? 0),
      newReviews: Number(body.newReviews ?? 0),
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
