import { NextResponse } from "next/server";
import { generateReviewDrafts, makeDraftNonce } from "@/lib/ai/generate";
import { findRequestByToken, getPublicProviders } from "@/lib/data";
import { resolveServiceOptions, resolveWorkspaceIndustry } from "@/lib/industries";
import {
  boundedNumber,
  boundedString,
  boundedStrings,
  guardPublicApi,
  readJsonObject,
} from "@/lib/security/api";
import type { DraftVariant } from "@/lib/data/types";

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

    const { location, staffName, industryKey, industryConfig, request } = context;
    const industry = resolveWorkspaceIndustry(industryKey ?? location.vertical, industryConfig);

    // A service or chip only counts if the owner actually offers it. An
    // attacker holding a valid token cannot inject arbitrary text into the
    // draft this way — unknown values are dropped, not passed through.
    //
    // The allowlist is built from the SAME resolver the customer page renders
    // from, so a real Google Business Profile service the customer just tapped
    // is never silently filtered back out of the prompt.
    const serviceOptions = resolveServiceOptions({
      gbpServiceItems: location.gbpSnapshot?.location.serviceItems,
      ownerServices: industryConfig?.customServices,
      catalogServices: industry.services,
    });
    const allowedServices = new Set(serviceOptions.services.map((s) => s.toLowerCase()));
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
      nonce: makeDraftNonce(token),
      ...(service ? { service } : {}),
      ...(staffName ? { staffName } : {}),
    });

    await persistDraft(token, location.workspaceId, request.id, variants, source);

    return NextResponse.json({ variants, source });
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}

/**
 * Store what we generated against the request that asked for it, so the owner
 * can see what wording was offered. Best-effort: a storage failure must never
 * cost the customer their draft, so it is swallowed.
 */
async function persistDraft(
  token: string,
  workspaceId: string,
  requestId: string,
  variants: DraftVariant[],
  source: "ai" | "template",
): Promise<void> {
  if (variants.length === 0) return;
  try {
    for (const provider of await getPublicProviders()) {
      const found = await provider.getRequestByToken(token);
      if (!found) continue;
      await provider.recordDraft(workspaceId, {
        requestId,
        kind: "review",
        variants,
        generatedBy: source,
      });
      return;
    }
  } catch {
    // Draft persistence is an owner-side convenience, never a customer blocker.
  }
}
