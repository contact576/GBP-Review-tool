import "server-only";
import { completeText } from "./client";
import { getModel, hasAiKey } from "./model";
import { SYSTEM_PROMPTS } from "./prompts";
import {
  fallbackReviewDrafts,
  fallbackReplyDrafts,
  fallbackCampaignCopy,
  fallbackTaskCopy,
  fallbackReportNarration,
  fallbackFeedbackSummary,
  fallbackScoreSample,
  type ReviewDraftInput,
  type ReplyDraftInput,
} from "./fallbacks";
import { runLints, type LintContext } from "@/lib/compliance/lints";
import type { DraftVariant } from "@/lib/data/types";

export type AiSource = "ai" | "template";

function sanitize(text: string, ctx: LintContext, fallback: string): string {
  const res = runLints(text, ctx);
  return res.ok ? text : fallback;
}

/** Split an AI multi-variant response on --- delimiters. */
function splitVariants(raw: string): string[] {
  return raw
    .split(/\n?---+\n?/)
    .map((s) => s.replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

// ── Review drafts (2–3 variants) ────────────────────────────
export async function generateReviewDrafts(
  input: ReviewDraftInput,
): Promise<{ variants: DraftVariant[]; source: AiSource }> {
  const template = fallbackReviewDrafts(input);
  const ctx: LintContext = {
    kind: "review",
    businessName: input.business,
    allowedFacts: [...input.attributes, input.service ?? "", input.staffName ?? ""],
  };
  if (!hasAiKey()) return { variants: template, source: "template" };

  const user = `Business: ${input.business} (${input.category}). Rating: ${input.rating}/5.
Things the customer liked: ${input.attributes.join(", ") || "(none specified)"}.
${input.staffName ? `Staff member: ${input.staffName}.` : ""}${input.service ? ` Service: ${input.service}.` : ""}
Write 3 distinct review options (Warm, then Short & punchy, then Detailed), separated by a line with only "---".`;

  const raw = await completeText({
    model: getModel(),
    system: SYSTEM_PROMPTS["review-draft"],
    user,
    maxTokens: 600,
  });
  if (!raw) return { variants: template, source: "template" };

  const parts = splitVariants(raw);
  if (parts.length < 2) return { variants: template, source: "template" };
  const tones = ["Warm", "Short & punchy", "Detailed"];
  const variants: DraftVariant[] = parts.slice(0, 3).map((text, i) => ({
    text: sanitize(text, ctx, template[i]?.text ?? template[0]!.text),
    tone: tones[i] ?? "Warm",
  }));
  return { variants, source: "ai" };
}

// ── Reply drafts (3 tones) ──────────────────────────────────
export async function generateReplyDrafts(
  input: ReplyDraftInput,
): Promise<{ variants: DraftVariant[]; source: AiSource }> {
  const template = fallbackReplyDrafts(input);
  const ctx: LintContext = { kind: "reply", businessName: input.business };
  if (!hasAiKey()) return { variants: template, source: "template" };

  const user = `Review (${input.rating}/5) by ${input.author ?? "a customer"}: "${input.reviewText}"
Business: ${input.business}.
Write 3 reply options in this order: warm, professional, brief. Separate each with a line of only "---".`;

  const raw = await completeText({
    model: getModel(),
    system: SYSTEM_PROMPTS["reply-draft"],
    user,
    maxTokens: 500,
  });
  if (!raw) return { variants: template, source: "template" };
  const parts = splitVariants(raw);
  if (parts.length < 2) return { variants: template, source: "template" };
  const tones = ["warm", "professional", "brief"];
  const variants: DraftVariant[] = parts.slice(0, 3).map((text, i) => ({
    text: sanitize(text, ctx, template[i]?.text ?? template[0]!.text),
    tone: tones[i] ?? "warm",
  }));
  return { variants, source: "ai" };
}

// ── Campaign copy ───────────────────────────────────────────
export async function generateCampaignCopy(input: {
  type: string;
  business: string;
  goal: string;
  channel: string;
}): Promise<{ subject: string; body: string; source: AiSource }> {
  const template = fallbackCampaignCopy(input);
  const ctx: LintContext = { kind: "campaign", businessName: input.business };
  if (!hasAiKey()) return { ...template, source: "template" };

  const user = `Campaign type: ${input.type}. Business: ${input.business}. Channel: ${input.channel}.
Goal/offer: ${input.goal || "(none)"}. Use {first_name} as a merge tag.
Return exactly:
SUBJECT: <subject>
BODY: <body>`;
  const raw = await completeText({
    model: getModel(),
    system: SYSTEM_PROMPTS["campaign-copy"],
    user,
    maxTokens: 400,
  });
  if (!raw) return { ...template, source: "template" };
  const subjMatch = raw.match(/SUBJECT:\s*(.+)/i);
  const bodyMatch = raw.match(/BODY:\s*([\s\S]+)/i);
  const subject = sanitize(subjMatch?.[1]?.trim() || template.subject, ctx, template.subject);
  const body = sanitize(bodyMatch?.[1]?.trim() || template.body, ctx, template.body);
  return { subject, body, source: "ai" };
}

// ── GBP task copy ───────────────────────────────────────────
export async function generateTaskCopy(input: {
  kind: string;
  business: string;
  context: string;
}): Promise<{ text: string; source: AiSource }> {
  const template = fallbackTaskCopy(input);
  const ctx: LintContext = { kind: input.kind === "qna" ? "qna" : "post", businessName: input.business };
  if (!hasAiKey()) return { text: template, source: "template" };
  const user = `Kind: ${input.kind}. Business: ${input.business}. Context: ${input.context || "(none)"}.`;
  const raw = await completeText({
    model: getModel(),
    system: SYSTEM_PROMPTS["task-copy"],
    user,
    maxTokens: 300,
  });
  if (!raw) return { text: template, source: "template" };
  return { text: sanitize(raw.trim(), ctx, template), source: "ai" };
}

// ── Report narration ────────────────────────────────────────
export async function generateReportNarration(input: {
  business: string;
  foundYou: number;
  foundDelta: number;
  contactedYou: number;
  newReviews: number;
}): Promise<{ text: string; source: AiSource }> {
  const template = fallbackReportNarration(input);
  const ctx: LintContext = { kind: "report", businessName: input.business };
  if (!hasAiKey()) return { text: template, source: "template" };
  const user = `Business: ${input.business}. People who found you: ${input.foundYou} (${input.foundDelta}% vs last month).
People who contacted you: ${input.contactedYou}. New reviews detected: ${input.newReviews}.
Write 2-3 warm sentences.`;
  const raw = await completeText({
    model: getModel(),
    system: SYSTEM_PROMPTS["report-narration"],
    user,
    maxTokens: 300,
  });
  if (!raw) return { text: template, source: "template" };
  return { text: sanitize(raw.trim(), ctx, template), source: "ai" };
}

// ── Feedback summary ────────────────────────────────────────
export async function generateFeedbackSummary(
  items: string[],
): Promise<{ theme: string; action: string; source: AiSource }> {
  const template = fallbackFeedbackSummary(items);
  if (!hasAiKey() || items.length === 0) return { ...template, source: "template" };
  const user = `Private feedback notes:\n${items.map((t, i) => `${i + 1}. ${t}`).join("\n")}
Return exactly:
THEME: <one line>
ACTION: <one line>`;
  const raw = await completeText({
    model: getModel(),
    system: SYSTEM_PROMPTS["feedback-summary"],
    user,
    maxTokens: 200,
  });
  if (!raw) return { ...template, source: "template" };
  const theme = raw.match(/THEME:\s*(.+)/i)?.[1]?.trim() || template.theme;
  const action = raw.match(/ACTION:\s*(.+)/i)?.[1]?.trim() || template.action;
  return { theme, action, source: "ai" };
}

// ── Free-score sample review ────────────────────────────────
export async function generateScoreSample(input: {
  business: string;
  category: string;
}): Promise<{ text: string; source: AiSource }> {
  const template = fallbackScoreSample(input);
  const ctx: LintContext = { kind: "review", businessName: input.business };
  if (!hasAiKey()) return { text: template, source: "template" };
  const user = `Business: ${input.business}. Category: ${input.category}. Write one short 5-star sample review.`;
  const raw = await completeText({
    model: getModel(),
    system: SYSTEM_PROMPTS["score-sample"],
    user,
    maxTokens: 200,
  });
  if (!raw) return { text: template, source: "template" };
  return { text: sanitize(raw.trim(), ctx, template), source: "ai" };
}
