import { NextResponse } from "next/server";
import { improveCustomerReviewText } from "@/lib/ai/generate";
import { findRequestByToken } from "@/lib/data";
import {
  boundedString,
  guardPublicApiAsync,
  readJsonObject,
} from "@/lib/security/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await readJsonObject(req, 8_192);
    const token = boundedString(body.token, 160);
    const ipLimited = await guardPublicApiAsync(req, "ai-review-edit-ip", 30, 60_000);
    if (ipLimited) return ipLimited;
    if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });

    const context = await findRequestByToken(token);
    if (!context) return NextResponse.json({ error: "invalid_token" }, { status: 404 });
    const tokenLimited = await guardPublicApiAsync(req, "ai-review-edit-token", 10, 60_000, token);
    if (tokenLimited) return tokenLimited;

    const text = boundedString(body.text, 2_000);
    if (!text || text.trim().length < 10) {
      return NextResponse.json({ error: "write_more_first" }, { status: 400 });
    }
    // Only the customer's own text reaches the model. Business metadata is
    // intentionally excluded so it cannot be inserted into their review.
    const result = await improveCustomerReviewText({ text });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
