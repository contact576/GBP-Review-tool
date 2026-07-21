import type { AiContentAsset, GbpProfileSnapshot, ProfileSuggestion } from "@/lib/data/types";
import { isContentSuggestionPreview, type ContentSuggestionPreview } from "@/lib/ai/content-studio";

const GBP_V4 = "https://mybusiness.googleapis.com/v4";
const QANDA_V1 = "https://mybusinessqanda.googleapis.com/v1";
const GBP_REVIEW_ID_PREFIX = "rev_gbp_";

export interface PreparedContentPublication {
  kind: "local_post" | "owner_reply" | "qna";
  method: "POST" | "PUT";
  endpoint: string;
  verificationEndpoint: string;
  body: Record<string, unknown>;
  expectedValue: string;
  assetId?: string;
}

function resourceId(resource: string, prefix: string): string {
  if (!resource.startsWith(prefix)) throw new Error(`Google resource must start with ${prefix}.`);
  const value = resource.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Google resource contains an invalid identifier.");
  return value;
}

export function legacyAccountLocation(snapshot: GbpProfileSnapshot): string {
  const accountId = resourceId(snapshot.accountResource, "accounts/");
  const locationId = resourceId(snapshot.locationResource, "locations/");
  return `accounts/${accountId}/locations/${locationId}`;
}

function exactText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} requires exact non-empty text.`);
  const text = value.trim();
  if (text.length > max) throw new Error(`${field} exceeds Google's supported length.`);
  return text;
}

function approvedPreview(suggestion: ProfileSuggestion): ContentSuggestionPreview {
  if (suggestion.status !== "approved" || !suggestion.approvedAt || !suggestion.approvedBy) {
    throw new Error("The exact content must be explicitly approved before publication.");
  }
  if (!suggestion.exactPreviewReady || !isContentSuggestionPreview(suggestion.proposedValue)) {
    throw new Error("The exact Google content payload must be previewed before approval.");
  }
  return suggestion.proposedValue;
}

export function prepareContentPublication(input: {
  suggestion: ProfileSuggestion;
  snapshot: GbpProfileSnapshot;
  asset?: AiContentAsset | null;
  publicImageUrl?: string;
}): PreparedContentPublication {
  const preview = approvedPreview(input.suggestion);
  const legacyParent = legacyAccountLocation(input.snapshot);

  if (input.suggestion.kind === "local_post" && preview.kind === "local_post") {
    const payload = preview.googlePayload as Extract<ContentSuggestionPreview["googlePayload"], { topicType: "STANDARD" }>;
    const summary = exactText(payload.summary, "Local post", 1_500);
    if (!preview.image || !input.asset || preview.image.assetId !== input.asset.id) {
      throw new Error("The approved local post image asset is missing or no longer matches the preview.");
    }
    if (input.asset.workspaceId !== input.suggestion.workspaceId || input.asset.suggestionId !== input.suggestion.id) {
      throw new Error("The local post image is outside this approval scope.");
    }
    if (!input.publicImageUrl || new URL(input.publicImageUrl).protocol !== "https:") {
      throw new Error("The approved image requires a signed public HTTPS URL for Google.");
    }
    const callToAction = payload.callToAction?.actionType
      ? {
          actionType: payload.callToAction.actionType,
          ...(payload.callToAction.url ? { url: payload.callToAction.url } : {}),
        }
      : undefined;
    return {
      kind: "local_post",
      method: "POST",
      endpoint: `${GBP_V4}/${legacyParent}/localPosts`,
      verificationEndpoint: "created-resource",
      body: {
        topicType: "STANDARD",
        languageCode: payload.languageCode || "en",
        summary,
        ...(callToAction ? { callToAction } : {}),
        media: [{ mediaFormat: "PHOTO", sourceUrl: input.publicImageUrl }],
      },
      expectedValue: summary,
      assetId: input.asset.id,
    };
  }

  if (input.suggestion.kind === "owner_reply" && preview.kind === "owner_reply") {
    const payload = preview.googlePayload as Extract<ContentSuggestionPreview["googlePayload"], { reviewId: string }>;
    const reviewId = exactText(payload.reviewId, "Review ID", 220);
    if (!reviewId.startsWith(GBP_REVIEW_ID_PREFIX)) throw new Error("Only an imported owned-profile review can be replied to.");
    const providerReviewId = resourceId(reviewId, GBP_REVIEW_ID_PREFIX);
    const comment = exactText(payload.comment, "Review reply", 4_096);
    const reviewName = `${legacyParent}/reviews/${providerReviewId}`;
    return {
      kind: "owner_reply",
      method: "PUT",
      endpoint: `${GBP_V4}/${reviewName}/reply`,
      verificationEndpoint: `${GBP_V4}/${reviewName}`,
      body: { comment },
      expectedValue: comment,
    };
  }

  if (input.suggestion.kind === "qna" && preview.kind === "qna") {
    const payload = preview.googlePayload as Extract<ContentSuggestionPreview["googlePayload"], { questionResource: string }>;
    const questionResource = exactText(payload.questionResource, "Question resource", 300);
    if (!/^locations\/[A-Za-z0-9_-]+\/questions\/[A-Za-z0-9_-]+$/.test(questionResource)) {
      throw new Error("The approved question resource is invalid.");
    }
    const answerText = exactText(payload.answerText, "Q&A answer", 4_096);
    return {
      kind: "qna",
      method: "POST",
      endpoint: `${QANDA_V1}/${questionResource}/answers:upsert`,
      verificationEndpoint: `${QANDA_V1}/${questionResource}/answers?pageSize=10&orderBy=updateTime%20desc`,
      body: { answer: { text: answerText } },
      expectedValue: answerText,
    };
  }

  throw new Error("This suggestion is not an approved Google content publication.");
}
