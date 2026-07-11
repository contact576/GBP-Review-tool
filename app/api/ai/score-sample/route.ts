import { NextResponse } from "next/server";
import { generateScoreSample } from "@/lib/ai/generate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await generateScoreSample({
      business: String(body.business ?? "the business"),
      category: String(body.category ?? "local business"),
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
