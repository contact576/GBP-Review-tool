import { NextResponse } from "next/server";
import { generateReviewDrafts } from "@/lib/ai/generate";
import { findRequestByToken } from "@/lib/data";
import { resolveWorkspaceIndustry } from "@/lib/industries";
import {
  boundedNumber,
  boundedString,
  boundedStrings,
  guardPublicApi,
  readJsonObject,
} from "@/lib/security/api";

export const runtime = "nodejs";

/**
 * Turn what the customer told us into starting-point wording for their review.
 *
 * The only inputs that shape the text are the customer's own answers — the
 * service they picked, the star rating they chose, and the experience chips
 * they tapped. Nothing is invented on their behalf: `generateReviewDrafts`
 * lints every variant against exactly those facts and swaps in the
 * deterministic template twin if a variant drifts. The customer still edits
 * and posts the words themselves, and the public Google link stays available
 * at every rating.
 */
export async function POST(req: Request) {
  try {
    const body = await readJsonObject(req, 8_192);
    const token = boundedString(body.token, 160);
    const ipLimited = guardPublicApi(req, "ai-review-draft-ip", 30, 60_000);
    if (ipLimited) return ipLimited;
    if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });

    const context = await findRequestByToken(token);
    if (!context) return NextResponse.json({ error: "invalid_token" }, { status: 404 });
    const tokenLimited = guardPublicApi(req, "ai-review-draft-token", 12, 60_000, token);
    if (tokenLimited) return tokenLimited;

    const rating = boundedNumber(body.rating, 1, 5, 0);
    if (!Number.isInteger(rating) || rating < 1) {
      return NextResponse.json({ error: "missing_rating" }, { status: 400 });
    }

    const { location, staffName, industryKey, industryConfig } = context;
    const industry = resolveWorkspaceIndustry(industryKey ?? location.vertical, industryConfig);

    // A service or chip only counts if the owner actually offers it. An
    // attacker holding a valid token cannot inject arbitrary text into the
    // draft this way — unknown values are dropped, not passed through.
    const allowedServices = new Set(industry.services.map((s) => s.toLowerCase()));
    const allowedChips = new Set(
      [...industry.attributes, ...industry.neutralAttributes].map((a) => a.toLowerCase()),
    );
    const requestedService = boundedString(body.service, 80);
    const service = allowedServices.has(requestedService.toLowerCase())
      ? requestedService
      : undefined;
    const attributes = boundedStrings(body.attributes, 6, 60).filter((chip) =>
      allowedChips.has(chip.toLowerCase()),
    );

    const { variants, source } = await generateReviewDrafts({
      business: location.name,
      category: location.category,
      rating,
      attributes,
      industryKey: industry.key,
      ...(service ? { service } : {}),
      ...(staffName ? { staffName } : {}),
    });

    return NextResponse.json({ variants, source });
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
