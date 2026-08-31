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

/**
 * The single owner-reply request builder. Both the governed suggestion-inbox
 * approval and the reviews-inbox reply drawer go through this, so the resource
 * naming, the owned-review guard, the exact 4,096-char comment validation and
 * the read-after-write verification endpoint can never drift between surfaces.
 */
function ownerReplyPlan(legacyParent: string, rawReviewId: unknown, rawComment: unknown): PreparedContentPublication {
  const reviewId = exactText(rawReviewId, "Review ID", 220);
  if (!reviewId.startsWith(GBP_REVIEW_ID_PREFIX)) throw new Error("Only an imported owned-profile review can be replied to.");
  const providerReviewId = resourceId(reviewId, GBP_REVIEW_ID_PREFIX);
  const comment = exactText(rawComment, "Review reply", 4_096);
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

/**
 * Plan the publication of an owner reply the owner wrote (or edited) directly
 * in the reviews inbox. The owner clicking "Post reply to Google" on the exact
 * visible text IS the approval, so no suggestion envelope is involved — but the
 * request itself is built by the same {@link ownerReplyPlan} the approval path
 * uses, and executed by the same runner with the same read-after-write check.
 */
export function prepareOwnerReplyPublication(input: {
  snapshot: GbpProfileSnapshot;
  reviewId: string;
  comment: string;
}): PreparedContentPublication {
  return ownerReplyPlan(legacyAccountLocation(input.snapshot), input.reviewId, input.comment);
}

/** True for a review imported from the owned Business Profile (repliable via the API). */
export function isOwnedGoogleReviewId(reviewId: string): boolean {
  return reviewId.startsWith(GBP_REVIEW_ID_PREFIX);
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
    return ownerReplyPlan(legacyParent, payload.reviewId, payload.comment);
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

// ── Owner-reply publishing: honest gating + honest reporting ────────────────
//
// Business Profile WRITE access is granted per Google Cloud project and can be
// pending for weeks. A reply must therefore never claim to have reached Google
// unless Foundly read it back off the profile. These pure helpers decide whether
// a real publish may be attempted, and turn whatever actually happened into copy
// that says exactly that — nothing softer.

/** Why an owner reply could not be published to Google right now. */
export type OwnerReplyPublishBlock =
  | "demo_workspace"
  | "not_connected"
  | "profile_not_synced"
  | "reply_access_pending"
  | "review_not_imported"
  | "rate_limited";

/** Workspace-level readiness — everything that does not depend on which review. */
export type OwnerReplyCapability =
  | { ready: true }
  | { ready: false; block: Exclude<OwnerReplyPublishBlock, "review_not_imported" | "rate_limited"> };

export type OwnerReplyPublishDecision =
  | { publish: true }
  | { publish: false; block: OwnerReplyPublishBlock };

/**
 * Can this workspace write owner replies to Google at all?
 *
 * A demo workspace is refused first and unconditionally — sample data must never
 * touch a real profile. After that a stored credential, a synced profile
 * snapshot, and a `reviews` source Google actually authorised are all required:
 * an unapproved project still returns a snapshot for the sources it could read,
 * so the per-source status is what proves the reply endpoint is reachable.
 */
export function resolveOwnerReplyCapability(input: {
  isDemo: boolean;
  hasGoogleCredential: boolean;
  snapshot?: Pick<GbpProfileSnapshot, "sourceStatus"> | null;
}): OwnerReplyCapability {
  if (input.isDemo) return { ready: false, block: "demo_workspace" };
  if (!input.hasGoogleCredential) return { ready: false, block: "not_connected" };
  if (!input.snapshot) return { ready: false, block: "profile_not_synced" };
  if (input.snapshot.sourceStatus.reviews !== "synced") return { ready: false, block: "reply_access_pending" };
  return { ready: true };
}

/** Workspace readiness plus the per-review check (only owned GBP reviews have a reply endpoint). */
export function decideOwnerReplyPublication(input: {
  isDemo: boolean;
  hasGoogleCredential: boolean;
  snapshot?: Pick<GbpProfileSnapshot, "sourceStatus"> | null;
  reviewId: string;
}): OwnerReplyPublishDecision {
  const capability = resolveOwnerReplyCapability(input);
  if (!capability.ready) return { publish: false, block: capability.block };
  if (!isOwnedGoogleReviewId(input.reviewId)) return { publish: false, block: "review_not_imported" };
  return { publish: true };
}

/** What actually happened to the reply, from Foundly's point of view. */
export type ReplyPublishState = "published" | "verification_pending" | "saved_locally" | "failed";

export interface ReplyPublishOutcome {
  state: ReplyPublishState;
  /** ONLY true when Google returned the reply on a fresh read-back. */
  publishedToGoogle: boolean;
  message: string;
}

/** The one thing that happened, as the action observed it. */
export type ReplyPublishSignal =
  | { kind: "blocked"; block: OwnerReplyPublishBlock }
  | { kind: "already_published" }
  | { kind: "in_flight" }
  | { kind: "executed"; ok: boolean; verified: boolean; error?: string };

/**
 * Frozen honesty copy for the reply drawer. Every "saved" string names the fact
 * that Google did NOT get it; the only string that claims Google has the reply
 * is the one gated on a verified read-back.
 */
export const REPLY_PUBLISH_COPY = Object.freeze({
  published: "Posted to Google — Foundly read your reply back from your profile to confirm it.",
  verificationPending:
    "Google accepted your reply, but Foundly could not read it back yet — treat it as unconfirmed until it appears.",
  alreadyPublished: "This exact reply is already on Google — Foundly did not post it twice.",
  inFlight: "This exact reply is already being posted — Foundly did not send it twice.",
  savedPrefix: "Saved in Foundly. Not posted to Google —",
  failedPrefix: "Saved in Foundly. Google did not accept the reply —",
  genericFailure: "Google rejected this publication.",
  reason: Object.freeze({
    demo_workspace: "the sample workspace never writes to a real Google profile.",
    not_connected: "connect your Google Business Profile to post replies from here.",
    profile_not_synced: "sync your Business Profile first so Foundly knows which Google review this is.",
    reply_access_pending: "Google has not approved review-reply access for this connection yet (typically 1–2 weeks).",
    review_not_imported: "this review came from Google's public sample, which has no reply endpoint.",
    rate_limited: "too many replies posted in the last hour — try again shortly.",
  } satisfies Record<OwnerReplyPublishBlock, string>),
});

/** The standing note shown in the drawer before the owner commits. */
export function replyPublishBlockNote(block: OwnerReplyPublishBlock): string {
  return `Not posted to Google — ${REPLY_PUBLISH_COPY.reason[block]}`;
}

/** Turn what happened into the exact state + sentence the owner is shown. */
export function resolveReplyPublishOutcome(signal: ReplyPublishSignal): ReplyPublishOutcome {
  if (signal.kind === "blocked") {
    return {
      state: "saved_locally",
      publishedToGoogle: false,
      message: `${REPLY_PUBLISH_COPY.savedPrefix} ${REPLY_PUBLISH_COPY.reason[signal.block]}`,
    };
  }
  if (signal.kind === "already_published") {
    return { state: "published", publishedToGoogle: true, message: REPLY_PUBLISH_COPY.alreadyPublished };
  }
  if (signal.kind === "in_flight") {
    return { state: "verification_pending", publishedToGoogle: false, message: REPLY_PUBLISH_COPY.inFlight };
  }
  if (!signal.ok) {
    const detail = signal.error?.trim() || REPLY_PUBLISH_COPY.genericFailure;
    return { state: "failed", publishedToGoogle: false, message: `${REPLY_PUBLISH_COPY.failedPrefix} ${detail}` };
  }
  if (!signal.verified) {
    const detail = signal.error?.trim();
    return {
      state: "verification_pending",
      publishedToGoogle: false,
      message: detail ? `${REPLY_PUBLISH_COPY.verificationPending} (${detail})` : REPLY_PUBLISH_COPY.verificationPending,
    };
  }
  return { state: "published", publishedToGoogle: true, message: REPLY_PUBLISH_COPY.published };
}
