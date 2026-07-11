import { NextResponse } from "next/server";
import { generateCampaignCopy } from "@/lib/ai/generate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await generateCampaignCopy({
      type: String(body.type ?? "promo"),
      business: String(body.business ?? "the business"),
      goal: String(body.goal ?? ""),
      channel: String(body.channel ?? "email"),
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
