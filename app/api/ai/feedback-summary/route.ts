import { NextResponse } from "next/server";
import { generateFeedbackSummary } from "@/lib/ai/generate";
import { boundedStrings, guardAuthenticatedApi, readJsonObject } from "@/lib/security/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await guardAuthenticatedApi(req, {
    scope: "ai-feedback-summary",
    roles: ["owner", "manager"],
    limit: 15,
  });
  if (!guard.ok) return guard.response;
  try {
    const body = await readJsonObject(req, 32_768);
    const items = boundedStrings(body.items, 100, 500);
    const result = await generateFeedbackSummary(items);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
