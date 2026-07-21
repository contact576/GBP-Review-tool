import { NextResponse } from "next/server";
import { generateCampaignCopy } from "@/lib/ai/generate";
import { boundedString, guardAuthenticatedApi, readJsonObject } from "@/lib/security/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await guardAuthenticatedApi(req, {
    scope: "ai-campaign-copy",
    roles: ["owner", "manager"],
    limit: 20,
  });
  if (!guard.ok) return guard.response;
  try {
    const body = await readJsonObject(req);
    const result = await generateCampaignCopy({
      type: boundedString(body.type, 40, "promo"),
      business: boundedString(body.business, 120, "the business"),
      goal: boundedString(body.goal, 1_000),
      channel: boundedString(body.channel, 20, "email"),
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
