import { NextResponse } from "next/server";
import { generateReviewDrafts } from "@/lib/ai/generate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await generateReviewDrafts({
      business: String(body.business ?? "the business"),
      category: String(body.category ?? "local business"),
      rating: Number(body.rating ?? 5),
      attributes: Array.isArray(body.attributes) ? body.attributes.map(String) : [],
      staffName: body.staffName ? String(body.staffName) : undefined,
      service: body.service ? String(body.service) : undefined,
      industryKey: body.industryKey ? String(body.industryKey) : undefined,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
