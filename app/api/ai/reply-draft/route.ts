import { NextResponse } from "next/server";
import { generateReplyDrafts } from "@/lib/ai/generate";
import {
  boundedNumber,
  boundedString,
  guardAuthenticatedApi,
  readJsonObject,
} from "@/lib/security/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await guardAuthenticatedApi(req, {
    scope: "ai-reply-draft",
    roles: ["owner", "manager"],
    limit: 30,
  });
  if (!guard.ok) return guard.response;
  try {
    const body = await readJsonObject(req);
    const result = await generateReplyDrafts({
      reviewText: boundedString(body.reviewText, 4_000),
      rating: Math.round(boundedNumber(body.rating, 1, 5, 5)),
      business: boundedString(body.business, 120, "the business"),
      author: boundedString(body.author, 120) || undefined,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
