import { NextResponse } from "next/server";
import { generateReplyDrafts } from "@/lib/ai/generate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await generateReplyDrafts({
      reviewText: String(body.reviewText ?? ""),
      rating: Number(body.rating ?? 5),
      business: String(body.business ?? "the business"),
      author: body.author ? String(body.author) : undefined,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
