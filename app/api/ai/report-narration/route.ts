import { NextResponse } from "next/server";
import { generateReportNarration } from "@/lib/ai/generate";
import {
  boundedNumber,
  boundedString,
  guardAuthenticatedApi,
  readJsonObject,
} from "@/lib/security/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await guardAuthenticatedApi(req, {
    scope: "ai-report-narration",
    roles: ["owner", "manager"],
    limit: 10,
  });
  if (!guard.ok) return guard.response;
  try {
    const body = await readJsonObject(req);
    const result = await generateReportNarration({
      business: boundedString(body.business, 120, "the business"),
      foundYou: boundedNumber(body.foundYou, 0, 1_000_000_000, 0),
      foundDelta: boundedNumber(body.foundDelta, -1_000_000_000, 1_000_000_000, 0),
      contactedYou: boundedNumber(body.contactedYou, 0, 1_000_000_000, 0),
      newReviews: boundedNumber(body.newReviews, 0, 1_000_000_000, 0),
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
