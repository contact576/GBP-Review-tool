import { NextResponse } from "next/server";
import { generateTaskCopy } from "@/lib/ai/generate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await generateTaskCopy({
      kind: String(body.kind ?? "post"),
      business: String(body.business ?? "the business"),
      context: String(body.context ?? ""),
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
