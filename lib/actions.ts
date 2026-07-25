"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getSession,
  createSession,
  createDemoSession,
  clearSession,
  type SessionRole,
  type Session,
} from "@/lib/auth/session";
import {
  getProviderFor,
  getPublicProviders,
  getRealProvider,
  type DataProvider,
} from "@/lib/data";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import {
  stripeEnabled,
  createCheckoutSession,
  createPortalSession,
} from "@/lib/billing/stripe";
import { emailEnabled, sendEmail } from "@/lib/email";
import {
  agencyGrowthReportEmail,
  passwordResetEmail,
  reviewRequestEmail,
  staffInviteEmail,
} from "@/lib/email/templates";
import { reviewRequestSms } from "@/lib/sms/templates";
import { sendSms, smsEnabled } from "@/lib/sms/twilio";
import { canonicalPhone, isE164 } from "@/lib/sms/phone";
import { appUrl } from "@/lib/utils/app-url";
import { consumeRateLimit } from "@/lib/security/api";
import { parseReferralCode } from "@/lib/referrals/code";
import { hasFeature } from "@/lib/billing/plans";
import type {
  CaptureCustomerInput,
  SendRequestInput,
  CreateCampaignInput,
  PostReplyInput,
  AddCustomerInput,
  CreateTaskInput,
  GoogleLocationPatch,
  CreateOrganizationWorkspaceInput,
} from "@/lib/data/provider";
import type {
  CustomerConsent,
  ReplyTone,
  Channel,
  Region,
  WhiteLabelConfig,
  WorkspaceSettings,
  IndustryConfig,
  PlanTier,
  Subscription,
  Customer,
  RankGridScan,
  ProfileMutationJob,
  ContentPublishingJob,
  AiContentAsset,
} from "@/lib/data/types";
import { prepareProfileMutation, stableStringify } from "@/lib/google/profile-mutation";
import { executeProfileMutation } from "@/lib/google/mutation-runner";
import { runLints } from "@/lib/compliance/lints";
import {
  suggestionToGenerationKind,
  type ContentSuggestionPreview,
  type GroundedContentInput,
} from "@/lib/ai/content-studio";
import { generateGroundedContentText, generateLocalPostImage } from "@/lib/ai/openai-content";
import { prepareContentPublication } from "@/lib/google/content-publishing";
import { executeContentPublication } from "@/lib/google/content-publish-runner";
import { createSignedContentAssetUrl } from "@/lib/security/content-asset-signature";

// ── Helpers ─────────────────────────────────────────────────
async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

async function requireRole(...allowed: SessionRole[]): Promise<Session> {
  const session = await requireSession();
  if (!allowed.includes(session.role)) {
    throw new Error("Forbidden");
  }
  return session;
}

async function scoped(...allowed: SessionRole[]) {
  const session = await requireRole(...allowed);
  const provider = await getProviderFor(session);
  return { session, provider, ws: session.workspaceId };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function deliverReviewRequest(
  provider: DataProvider,
  ws: string,
  request: { id: string; token: string; channel: Channel; customerName: string },
  customer?: Pick<Customer, "email" | "phone" | "consent" | "suppressedReason">,
  simulate = false,
): Promise<"sent" | "failed" | "suppressed"> {
  let status: "sent" | "failed" | "suppressed" = "failed";
  let reason: string | undefined;
  if (simulate) {
    status = "sent";
  } else {
    const data = await provider.getData(ws);
    const phone = canonicalPhone(customer?.phone);
    const suppressed =
      customer?.suppressedReason ||
      data?.suppression.some(
        (entry) => entry.matchType === "phone" && canonicalPhone(entry.value) === phone,
      );
    if (!customer?.consent.serviceConsent || customer.consent.withdrawnAt || suppressed) {
      status = "suppressed";
      reason = customer?.suppressedReason ?? "Service consent is missing or withdrawn.";
    } else if (request.channel === "email" && customer.email && emailEnabled() && data) {
      try {
        const base = await appUrl();
        const { subject, html } = reviewRequestEmail({
          business: data.location.name,
          customerName: request.customerName,
          link: `${base}/r/${request.token}`,
        });
        const result = await sendEmail({ to: customer.email, subject, html });
        status = result.ok ? "sent" : "failed";
      } catch {
        status = "failed";
      }
    } else if (request.channel === "sms" && customer.phone && smsEnabled() && data) {
      if (!isE164(customer.phone)) {
        reason = "SMS phone number must use E.164 format, such as +14155550123.";
      } else if (
        data.subscription.usage.smsCreditsTotal >= 0 &&
        data.subscription.usage.smsCreditsUsed >= data.subscription.usage.smsCreditsTotal
      ) {
        reason = "The workspace has used all SMS credits for this billing cycle.";
      } else {
        const base = await appUrl();
        const result = await sendSms({
          to: customer.phone,
          body: reviewRequestSms({
            business: data.location.name,
            customerName: request.customerName,
            link: `${base}/r/${request.token}`,
          }),
          statusCallback: `${base}/api/webhooks/twilio/status?workspaceId=${encodeURIComponent(ws)}&requestId=${encodeURIComponent(request.id)}`,
        });
        status = result.ok ? "sent" : "failed";
        if (!result.ok) reason = result.error;
      }
    }
  }
  await provider.setRequestDeliveryStatus(ws, request.id, status, reason);
  return status;
}

async function requestIdentity(): Promise<string> {
  const store = await headers();
  return (
    store.get("cf-connecting-ip") ||
    store.get("x-real-ip") ||
    store.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function guardPublicAction(
  scope: string,
  rawToken: string,
  tokenLimit: number,
): Promise<string> {
  const token = typeof rawToken === "string" ? rawToken.trim().slice(0, 160) : "";
  if (!token) throw new Error("Invalid review link");
  const identity = await requestIdentity();
  const ipRate = consumeRateLimit(`${scope}-ip`, identity, 60, 10 * 60_000);
  const tokenRate = consumeRateLimit(`${scope}-token`, token, tokenLimit, 10 * 60_000);
  if (!ipRate.allowed || !tokenRate.allowed) throw new Error("Too many attempts");
  return token;
}

// ── Auth: registration ──────────────────────────────────────
export interface AuthFormResult {
  ok: boolean;
  error?: string;
}

export async function registerAction(input: {
  name: string;
  email: string;
  password: string;
  businessName: string;
  industryKey: string;
  region: Region;
  referralCode?: string;
}): Promise<AuthFormResult> {
  const registerRate = consumeRateLimit(
    "auth-register",
    await requestIdentity(),
    30,
    10 * 60_000,
  );
  if (!registerRate.allowed) {
    return { ok: false, error: "Too many sign-up attempts. Please try again shortly." };
  }
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const businessName = input.businessName.trim();
  if (!name) return { ok: false, error: "Please enter your name." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };
  if (!businessName) return { ok: false, error: "Please enter your business name." };
  const pwError = validatePasswordStrength(input.password);
  if (pwError) return { ok: false, error: pwError };

  const provider = await getRealProvider(); // Postgres (or memory fallback) — never demo
  const result = await provider.registerUser({
    name,
    email,
    password: input.password,
    businessName,
    industryKey: input.industryKey || "professional_services",
    region: input.region,
    referredByWorkspaceId: parseReferralCode(input.referralCode) ?? undefined,
  });
  if (!result.ok) return { ok: false, error: result.error };

  await createSession({
    userId: result.user.id,
    workspaceId: result.user.workspaceId,
    role: result.user.role,
    isDemo: false,
    name: result.user.name,
    email: result.user.email,
  });
  return { ok: true };
}

// ── Auth: sign in ───────────────────────────────────────────
export async function loginAction(input: {
  email: string;
  password: string;
}): Promise<AuthFormResult> {
  const email = input.email.trim().toLowerCase();
  const loginByEmail = consumeRateLimit("auth-login-email", email || "missing", 10, 10 * 60_000);
  const loginByIp = consumeRateLimit(
    "auth-login-ip",
    await requestIdentity(),
    100,
    10 * 60_000,
  );
  if (!loginByEmail.allowed || !loginByIp.allowed) {
    return { ok: false, error: "Too many sign-in attempts. Please try again shortly." };
  }
  if (!EMAIL_RE.test(email) || !input.password) {
    return { ok: false, error: "Invalid email or password." };
  }
  const provider = await getRealProvider();
  const user = await provider.verifyCredentials(email, input.password);
  if (!user) return { ok: false, error: "Invalid email or password." };
  await createSession({
    userId: user.id,
    workspaceId: user.workspaceId,
    role: user.role,
    isDemo: false,
    name: user.name,
    email: user.email,
  });
  return { ok: true };
}

const RESET_TOKEN_RE = /^[A-Za-z0-9_-]{43,128}$/;

function resetTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface PasswordResetResult {
  ok: boolean;
  message: string;
}

/** Request a one-time reset link without revealing whether an account exists. */
export async function requestPasswordResetAction(emailInput: string): Promise<PasswordResetResult> {
  const email = typeof emailInput === "string" ? emailInput.trim().toLowerCase().slice(0, 320) : "";
  const identity = await requestIdentity();
  const byIp = consumeRateLimit("password-reset-request-ip", identity, 20, 60 * 60_000);
  const byEmail = consumeRateLimit("password-reset-request-email", email || "missing", 5, 60 * 60_000);
  if (!byIp.allowed || !byEmail.allowed) {
    return { ok: false, message: "Too many reset requests. Please try again later." };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, message: "Please enter a valid email address." };
  }
  if (!emailEnabled()) {
    return {
      ok: false,
      message: "Password-reset email is not configured for this environment yet.",
    };
  }

  const provider = await getRealProvider();
  const user = await provider.getUserByEmail(email);
  const generic = "If an account exists for that email, a one-hour reset link has been sent.";
  if (!user) return { ok: true, message: generic };

  const token = randomBytes(32).toString("base64url");
  const tokenHash = resetTokenHash(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 60 * 60_000);
  await provider.savePasswordResetToken({
    tokenHash,
    userId: user.id,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  const base = await appUrl();
  const template = passwordResetEmail({
    link: `${base}/reset-password?token=${encodeURIComponent(token)}`,
  });
  const delivered = await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
  });
  if (!delivered.ok) {
    await provider.revokePasswordResetToken(tokenHash);
    return { ok: false, message: "The reset email could not be delivered. Please try again." };
  }
  return { ok: true, message: generic };
}

/** Consume a one-time reset token and replace the password with a bcrypt hash. */
export async function resetPasswordAction(input: {
  token: string;
  password: string;
}): Promise<PasswordResetResult> {
  const token = typeof input.token === "string" ? input.token.trim() : "";
  const identity = await requestIdentity();
  const byIp = consumeRateLimit("password-reset-consume-ip", identity, 30, 60 * 60_000);
  const byToken = consumeRateLimit(
    "password-reset-consume-token",
    token ? resetTokenHash(token) : "missing",
    5,
    60 * 60_000,
  );
  if (!byIp.allowed || !byToken.allowed) {
    return { ok: false, message: "Too many reset attempts. Please request a new link." };
  }
  if (!RESET_TOKEN_RE.test(token)) {
    return { ok: false, message: "This reset link is invalid or has expired." };
  }
  const passwordError = validatePasswordStrength(input.password);
  if (passwordError) return { ok: false, message: passwordError };

  const provider = await getRealProvider();
  const passwordHash = await hashPassword(input.password);
  const consumed = await provider.consumePasswordResetToken(
    resetTokenHash(token),
    passwordHash,
    new Date().toISOString(),
  );
  return consumed
    ? { ok: true, message: "Your password has been reset. You can sign in now." }
    : { ok: false, message: "This reset link is invalid, expired, or has already been used." };
}

/** Explicit demo entry — sessions are flagged isDemo and use seeded data. */
export async function enterDemoAction(role: SessionRole = "owner") {
  await createDemoSession(role);
}

/** @deprecated kept for compatibility; demo entry only. */
export async function signInAction(role: SessionRole = "owner") {
  await createDemoSession(role);
}

export async function signOutAction() {
  await clearSession();
  redirect("/sign-in");
}

// ── Capture / requests ──────────────────────────────────────
export async function captureCustomerAction(input: CaptureCustomerInput) {
  const { provider, ws, session } = await scoped("owner", "manager", "staff");
  const result = await provider.captureCustomer(ws, input);
  const status = await deliverReviewRequest(provider, ws, result.request, result.customer, session.isDemo);
  revalidatePath("/app");
  revalidatePath("/app/requests");
  revalidatePath("/app/customers");
  revalidatePath("/staff");
  return { token: result.request.token, customerName: result.customer.name, status };
}

export async function addCustomerAction(input: AddCustomerInput) {
  const { provider, ws } = await scoped("owner", "manager", "staff");
  const customer = await provider.addCustomer(ws, input);
  revalidatePath("/app/customers");
  return { id: customer.id };
}

export async function sendRequestAction(input: SendRequestInput) {
  const { provider, ws, session } = await scoped("owner", "manager", "staff");
  const req = await provider.sendRequest(ws, input);
  revalidatePath("/app/requests");
  revalidatePath("/app/customers");

  // Best-effort delivery — never blocks the request, never fakes success.
  const data = await provider.getData(ws);
  const customer = data?.customers.find((item) => item.id === input.customerId);
  const status = await deliverReviewRequest(provider, ws, req, customer, session.isDemo);
  return { token: req.token, emailed: status === "sent", status };
}

// Public (token-keyed, no session) — used by the customer review flow.
export async function advanceRequestAction(
  token: string,
  to: "opened" | "clicked",
  meta?: { rating?: 1 | 2 | 3 | 4 | 5; attributes?: string[] },
) {
  const safeToken = await guardPublicAction("review-progress", token, 20);
  if (to !== "opened" && to !== "clicked") throw new Error("Invalid review transition");
  const rating = Number(meta?.rating);
  const safeMeta = {
    rating:
      Number.isInteger(rating) && rating >= 1 && rating <= 5
        ? (rating as 1 | 2 | 3 | 4 | 5)
        : undefined,
    attributes: Array.isArray(meta?.attributes)
      ? meta.attributes
          .filter((item): item is string => typeof item === "string")
          .slice(0, 12)
          .map((item) => item.trim().slice(0, 60))
          .filter(Boolean)
      : undefined,
  };
  let found = false;
  for (const provider of await getPublicProviders()) {
    const result = await provider.advanceRequest(safeToken, to, safeMeta);
    if (result) {
      found = true;
      break;
    }
  }
  if (!found) throw new Error("Invalid review link");
  revalidatePath("/app");
  revalidatePath("/app/requests");
}

export async function submitPrivateFeedbackAction(input: {
  token: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
}) {
  const token = await guardPublicAction("private-feedback", input.token, 5);
  const rating = Number(input.rating);
  const text = typeof input.text === "string" ? input.text.trim().slice(0, 4_000) : "";
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !text) {
    throw new Error("Invalid feedback");
  }
  let submitted = false;
  for (const provider of await getPublicProviders()) {
    const found = await provider.getRequestByToken(token);
    if (found) {
      if (found.request.status !== "private_feedback") {
        await provider.submitPrivateFeedback({
          token,
          rating: rating as 1 | 2 | 3 | 4 | 5,
          text,
        });
      }
      submitted = true;
      break;
    }
  }
  if (!submitted) throw new Error("Invalid review link");
  revalidatePath("/app");
}

export async function resolveFeedbackAction(feedbackId: string) {
  const { provider, ws } = await scoped("owner", "manager");
  await provider.resolvePrivateFeedback(ws, feedbackId);
  revalidatePath("/app");
}

// ── Co-Pilot ────────────────────────────────────────────────
export async function approveTaskAction(taskId: string) {
  const { provider, ws } = await scoped("owner", "manager");
  await provider.approveTask(ws, taskId);
  revalidatePath("/app");
  revalidatePath("/app/this-week");
}

export async function snoozeTaskAction(taskId: string) {
  const { provider, ws } = await scoped("owner", "manager");
  await provider.snoozeTask(ws, taskId);
  revalidatePath("/app/this-week");
}

export async function createTaskAction(input: CreateTaskInput) {
  const { provider, ws } = await scoped("owner", "manager");
  const task = await provider.createGbpTask(ws, input);
  revalidatePath("/app/this-week");
  return { id: task.id };
}

// ── Reviews ─────────────────────────────────────────────────
export async function postReplyAction(input: PostReplyInput & { tone: ReplyTone }) {
  const { provider, ws } = await scoped("owner", "manager");
  await provider.postReply(ws, input);
  revalidatePath("/app/reviews");
  revalidatePath("/app");
}

// ── Campaigns ───────────────────────────────────────────────
export async function createCampaignAction(input: CreateCampaignInput) {
  const { provider, ws } = await scoped("owner", "manager");
  const c = await provider.createCampaign(ws, input);
  revalidatePath("/app/campaigns");
  return { id: c.id, consented: c.audienceConsented, total: c.audienceTotal };
}

export async function setCampaignStatusAction(campaignId: string, status: "active" | "paused") {
  const { provider, ws } = await scoped("owner", "manager");
  await provider.setCampaignStatus(ws, campaignId, status);
  revalidatePath("/app/campaigns");
}

// ── Consent ─────────────────────────────────────────────────
export async function updateConsentAction(
  customerId: string,
  consent: Partial<CustomerConsent>,
) {
  const { provider, ws } = await scoped("owner", "manager");
  await provider.updateConsent(ws, customerId, consent);
  revalidatePath("/app/customers");
}

// ── Workspace configuration ─────────────────────────────────
export async function updateIndustryAction(industryKey: string, config?: IndustryConfig) {
  const { provider, ws } = await scoped("owner");
  await provider.updateIndustry(ws, industryKey, config);
  revalidatePath("/", "layout");
}

export async function updateWorkspaceSettingsAction(patch: Partial<WorkspaceSettings>) {
  const { provider, ws } = await scoped("owner");
  await provider.updateWorkspaceSettings(ws, patch);
  revalidatePath("/app/settings", "layout");
}

export async function updateLocationGoogleAction(patch: GoogleLocationPatch) {
  const { provider, ws } = await scoped("owner", "manager");
  await provider.updateLocationGoogle(ws, patch);
  revalidatePath("/", "layout");
}

// ── Google data sync ────────────────────────────────────────
export interface GoogleSyncActionResult {
  ok: boolean;
  message: string;
  pendingApproval?: boolean;
  rating?: number;
  reviewCount?: number;
  capabilityScore?: number;
  mediaImported?: number;
  warningCount?: number;
  auditFindings?: number;
  suggestionsCreated?: number;
}

/**
 * Pull real Google data into the workspace:
 *  - public data (aggregate rating/count + review sample) via Places — works now
 *  - full profile (all reviews + performance) via GBP — imports once Google
 *    approves the project; reports honestly as pending until then.
 */
export async function syncGoogleAction(): Promise<GoogleSyncActionResult> {
  const { provider, ws, session } = await scoped("owner", "manager");
  if (session.isDemo) {
    return { ok: false, message: "The demo uses sample data — sign up to sync your real Google data." };
  }

  const pub = await provider.syncGooglePublic(ws);
  const profile = await provider.syncGoogleProfile(ws);

  revalidatePath("/app");
  revalidatePath("/app/reviews");
  revalidatePath("/app/settings/integrations");
  revalidatePath("/app/settings/business");

  if (!pub.ok) {
    return { ok: false, message: pub.error ?? "Couldn't reach Google — please try again." };
  }

  const stars = typeof pub.rating === "number" ? pub.rating.toFixed(1) : "—";
  const base = `Synced your public Google data: ${stars}★ from ${pub.reviewCount ?? 0} reviews.`;

  if (profile.ok && profile.pendingApproval) {
    return {
      ok: true,
      pendingApproval: true,
      rating: pub.rating,
      reviewCount: pub.reviewCount,
      message: `${base} Your full review history and performance import automatically once Google approves your Business Profile connection (typically 1–2 weeks).`,
    };
  }
  if (profile.ok) {
    return {
      ok: true,
      rating: profile.rating ?? pub.rating,
      reviewCount: profile.reviewCount ?? pub.reviewCount,
      capabilityScore: profile.capabilityScore,
      mediaImported: profile.mediaImported,
      warningCount: profile.warnings?.length ?? 0,
      auditFindings: profile.auditFindings,
      suggestionsCreated: profile.suggestionsCreated,
      message: `Synced ${profile.reviewsImported ?? 0} reviews and ${profile.mediaImported ?? 0} original Google media items. Applicable profile completion: ${profile.capabilityScore ?? 0}%. Prepared ${profile.suggestionsCreated ?? 0} evidence-backed suggestions.${profile.warnings?.length ? ` ${profile.warnings.length} optional data source${profile.warnings.length === 1 ? "" : "s"} need attention.` : ""}`,
    };
  }
  // Public worked; profile isn't connected yet (or a soft error) — stay honest.
  return {
    ok: true,
    rating: pub.rating,
    reviewCount: pub.reviewCount,
    message: `${base} Connect your Google Business Profile to import your full review history and performance.`,
  };
}

export type ProfileSuggestionActionResult =
  | { ok: true; message: string; status: "queued" | "executing" | "verification_pending" | "applied" }
  | { ok: false; message: string; status?: "failed" };

export type ContentPreviewActionResult =
  | { ok: true; message: string; status: "ready_for_review" }
  | { ok: false; message: string };

function sameAllowedUrl(candidate: string, allowed: Array<string | undefined>): string | undefined {
  if (!candidate) return undefined;
  try {
    const parsed = new URL(candidate);
    return allowed.some((value) => {
      if (!value) return false;
      try {
        const approved = new URL(value);
        return parsed.protocol === "https:" && parsed.origin === approved.origin;
      } catch {
        return false;
      }
    }) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Turn an evidence-backed suggestion into the exact text and private image
 * asset an owner can review. This action never writes to Google.
 */
export async function generateContentSuggestionPreviewAction(
  suggestionId: string,
): Promise<ContentPreviewActionResult> {
  const { provider, ws, session } = await scoped("owner", "manager");
  const limited = consumeRateLimit("ai-content-preview", session.userId, 8, 60 * 60_000);
  if (!limited.allowed) {
    return { ok: false, message: `Content generation is rate-limited. Try again in ${limited.retryAfter} seconds.` };
  }
  const data = await provider.getData(ws);
  if (!data) return { ok: false, message: "The workspace could not be loaded." };
  const suggestion = (data.location.suggestionInbox ?? []).find((item) => item.id === suggestionId);
  if (!suggestion) return { ok: false, message: "This suggestion no longer exists. Refresh and try again." };
  const kind = suggestionToGenerationKind(suggestion);
  if (!kind) return { ok: false, message: "This suggestion requires a different preparation workflow." };
  if (!["needs_generation", "failed", "ready_for_review"].includes(suggestion.status)) {
    return { ok: false, message: "This suggestion cannot be regenerated in its current state." };
  }

  const snapshot = data.location.gbpSnapshot;
  const audit = data.location.gbpAudit;
  const conflictedIds = new Set(
    (audit?.conflicts ?? [])
      .filter((conflict) => conflict.status !== "resolved")
      .flatMap((conflict) => conflict.evidenceIds),
  );
  const linkedFacts = (audit?.evidence ?? [])
    .filter((fact) => suggestion.evidenceIds.includes(fact.id))
    .filter((fact) => !conflictedIds.has(fact.id))
    .filter((fact) => fact.authoritative || fact.source === "owner")
    .slice(0, 30)
    .map((fact) => ({ id: fact.id, field: fact.field, value: fact.value, source: fact.source }));
  const verifiedFacts: GroundedContentInput["verifiedFacts"] = [
    { id: "profile.business_name", field: "business_name", value: data.location.name, source: "google_profile" },
    { id: "profile.primary_category", field: "primary_category", value: snapshot?.location.categories?.primaryCategory ?? data.location.category, source: "google_profile" },
    { id: "profile.city", field: "city", value: data.location.city, source: "google_profile" },
    ...(snapshot?.location.serviceItems?.length
      ? [{ id: "profile.services", field: "services", value: snapshot.location.serviceItems, source: "google_profile" }]
      : []),
    ...linkedFacts,
  ].slice(0, 40);

  const unreplied = data.reviews.filter((review) => review.needsReply && !review.reply);
  const review = kind === "owner_reply"
    ? unreplied.find((item) => suggestion.title.toLowerCase().includes(item.author.toLowerCase())) ?? unreplied[0]
    : undefined;
  if (kind === "owner_reply" && !review) {
    return { ok: false, message: "No unreplied Google review is available for this suggestion." };
  }
  const question = kind === "qna"
    ? snapshot?.questions.find((item) => !item.totalAnswerCount && !item.topAnswers?.length)
    : undefined;
  if (kind === "qna" && !question?.text) {
    return { ok: false, message: "No unanswered Google question is available for this suggestion." };
  }

  try {
    const generated = await generateGroundedContentText({
      kind,
      businessName: data.location.name,
      primaryCategory: data.location.category,
      city: data.location.city,
      existingDescription: snapshot?.location.profile?.description ?? data.location.profile.description,
      verifiedFacts,
      ...(review ? { review: { id: review.id, author: review.author, rating: review.rating, text: review.text } } : {}),
      ...(question?.text ? { question: { resourceName: question.name, text: question.text } } : {}),
    });
    const lintKind = kind === "owner_reply" ? "reply" : kind === "qna" ? "qna" : "post";
    const lint = runLints(generated.content.body, { kind: lintKind, businessName: data.location.name });
    if (!lint.ok) {
      throw new Error(`The generated draft failed Foundly's safety checks (${lint.flags[0]?.code ?? "content_policy"}).`);
    }

    const generatedAt = new Date().toISOString();
    const allowedUrl = sameAllowedUrl(generated.content.callToAction.url, [snapshot?.location.websiteUri]);
    const cta = generated.content.callToAction.actionType !== "NONE"
      ? { actionType: generated.content.callToAction.actionType, ...(allowedUrl ? { url: allowedUrl } : {}) }
      : undefined;
    let asset: AiContentAsset | undefined;
    let imageModel: string | undefined;
    if (kind === "local_post") {
      const generatedImage = await generateLocalPostImage(generated.content.imagePrompt);
      imageModel = generatedImage.model;
      const assetId = `asset_${randomBytes(12).toString("hex")}`;
      asset = {
        id: assetId,
        workspaceId: ws,
        locationId: data.location.id,
        suggestionId,
        kind: "image",
        mimeType: generatedImage.mimeType,
        base64Data: generatedImage.base64Data,
        prompt: generated.content.imagePrompt,
        altText: generated.content.altText,
        model: generatedImage.model,
        createdAt: generatedAt,
        updatedAt: generatedAt,
      };
      await provider.saveAiContentAsset(ws, asset);
    }

    const common = {
      schemaVersion: 1 as const,
      kind,
      headline: generated.content.headline,
      body: generated.content.body,
      ...(cta ? { callToAction: cta } : {}),
      evidenceIds: suggestion.evidenceIds,
      evidenceSummary: generated.content.evidenceSummary,
      generatedBy: {
        provider: "openai" as const,
        textModel: generated.model,
        ...(imageModel ? { imageModel } : {}),
        generatedAt,
      },
      ...(asset ? {
        image: {
          assetId: asset.id,
          src: `/api/ai/content-assets/${asset.id}`,
          mimeType: asset.mimeType,
          altText: asset.altText,
        },
      } : {}),
    };
    let preview: ContentSuggestionPreview;
    // Content kinds (post/reply/qna) publish from the full preview envelope —
    // content-publishing reads its `googlePayload`, so the preview IS the stored
    // value. A profile_copy edit instead flows through `prepareProfileMutation`,
    // which needs the EXACT Google field value (the description text itself), not
    // the envelope — storing the preview object there makes every approval fail
    // its exact-value validation. So store the exact text for profile_copy.
    let proposedValue: unknown;
    if (kind === "local_post") {
      preview = {
        ...common,
        kind,
        googlePayload: {
          topicType: "STANDARD",
          languageCode: "en",
          summary: generated.content.body,
          ...(cta ? { callToAction: cta } : {}),
        },
      };
      proposedValue = preview;
    } else if (kind === "owner_reply" && review) {
      preview = { ...common, kind, googlePayload: { reviewId: review.id, comment: generated.content.body } };
      proposedValue = preview;
    } else if (kind === "qna" && question?.text) {
      preview = { ...common, kind, googlePayload: { questionResource: question.name, answerText: generated.content.body } };
      proposedValue = preview;
    } else {
      preview = { ...common, kind: "profile_copy", googlePayload: { description: generated.content.body } };
      proposedValue = generated.content.body.trim();
    }

    await provider.updateProfileSuggestion(ws, suggestionId, {
      status: "ready_for_review",
      proposedValue,
      exactPreviewReady: true,
      blockers: [],
      nextStep: "Review exact preview",
      updatedAt: generatedAt,
    });
    await provider.appendAuditLog(ws, {
      id: `audit_${randomBytes(12).toString("hex")}`,
      workspaceId: ws,
      actor: session.name,
      action: "content.preview_generated",
      targetType: "profile_suggestion",
      targetId: suggestionId,
      at: generatedAt,
      meta: { kind, textModel: generated.model, imageGenerated: Boolean(asset) },
    });
    revalidatePath("/app/studio");
    revalidatePath("/app/this-week");
    return {
      ok: true,
      status: "ready_for_review",
      message: asset
        ? "The exact post and original AI image are ready for your review. Nothing has been published."
        : "The exact draft is ready for your review. Nothing has been published.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Content generation failed.";
    await provider.updateProfileSuggestion(ws, suggestionId, {
      status: "needs_generation",
      exactPreviewReady: false,
      blockers: [message.slice(0, 180)],
      nextStep: "Try generation again",
      updatedAt: new Date().toISOString(),
    });
    return { ok: false, message };
  }
}

/**
 * Approve one exact diff and apply it once. Every network mutation is backed by
 * an idempotent ledger row and a read-after-write verification result.
 */
export async function approveProfileSuggestionAction(
  suggestionId: string,
  factsConfirmed = false,
): Promise<ProfileSuggestionActionResult> {
  const { provider, ws, session } = await scoped("owner", "manager");
  if (session.isDemo) {
    return { ok: false, message: "The demo cannot change a live Google Business Profile." };
  }
  const data = await provider.getData(ws);
  if (!data?.location.gbpSnapshot) {
    return { ok: false, message: "Sync Google Business Profile before approving changes." };
  }
  const existing = data.location.suggestionInbox?.find((item) => item.id === suggestionId);
  if (!existing) return { ok: false, message: "This suggestion no longer exists. Refresh and try again." };
  if (["local_post", "owner_reply", "qna"].includes(existing.kind)) {
    return { ok: false, message: "Use the governed content-publishing approval for this suggestion." };
  }
  if (existing.status !== "ready_for_review") {
    return { ok: false, message: "Only an exact preview that is ready for review can be approved." };
  }

  const approvedAt = new Date().toISOString();
  const approved = {
    ...existing,
    status: "approved" as const,
    approvedAt,
    approvedBy: session.name,
    ...(factsConfirmed ? { factsConfirmedAt: approvedAt, factsConfirmedBy: session.name } : {}),
  };
  let plan;
  try {
    plan = prepareProfileMutation(approved, data.location.gbpSnapshot);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The exact change is invalid." };
  }

  const idempotencyKey = createHash("sha256")
    .update(`${ws}:${suggestionId}:${existing.target}:${stableStringify(existing.proposedValue)}`)
    .digest("hex");
  const now = new Date().toISOString();
  const proposedJob: ProfileMutationJob = {
    id: `mut_${randomBytes(12).toString("hex")}`,
    workspaceId: ws,
    locationId: data.location.id,
    suggestionId,
    idempotencyKey,
    target: existing.target,
    status: "queued",
    updateMask: plan.updateMask,
    beforeValue: plan.beforeValue,
    proposedValue: plan.proposedValue,
    rollbackValue: plan.beforeValue,
    attempts: 0,
    approvedAt,
    approvedBy: session.name,
    createdAt: now,
    updatedAt: now,
  };
  const created = await provider.createProfileMutationJob(ws, proposedJob);
  if (!created.created) {
    const status = created.job.status;
    if (status === "applied") {
      await provider.updateProfileSuggestion(ws, suggestionId, { status: "applied", updatedAt: now });
      return { ok: true, status: "applied", message: "This exact change was already applied and verified." };
    }
    if (status === "failed") {
      return { ok: false, status: "failed", message: created.job.lastError ?? "The previous attempt failed. Review it before retrying." };
    }
    return {
      ok: true,
      status: status === "verification_pending" ? "verification_pending" : status === "executing" ? "executing" : "queued",
      message: "This exact change is already queued; it was not submitted twice.",
    };
  }

  await provider.updateProfileSuggestion(ws, suggestionId, {
    status: "queued",
    approvedAt,
    approvedBy: session.name,
    ...(factsConfirmed ? { factsConfirmedAt: approvedAt, factsConfirmedBy: session.name } : {}),
    updatedAt: now,
  });
  await provider.appendAuditLog(ws, {
    id: `audit_${randomBytes(12).toString("hex")}`,
    workspaceId: ws,
    actor: session.name,
    action: "profile.change_approved",
    targetType: "profile_suggestion",
    targetId: suggestionId,
    at: now,
    meta: { mutationJobId: created.job.id, target: existing.target, risk: existing.risk },
  });

  const startedAt = new Date().toISOString();
  await provider.updateProfileMutationJob(ws, created.job.id, {
    status: "executing",
    attempts: created.job.attempts + 1,
    startedAt,
    updatedAt: startedAt,
  });
  await provider.updateProfileSuggestion(ws, suggestionId, { status: "executing", updatedAt: startedAt });

  let execution;
  try {
    execution = await executeProfileMutation(plan, await provider.getGoogleCredential(ws));
  } catch (error) {
    execution = { ok: false, verified: false, error: error instanceof Error ? error.message : "Google mutation failed." };
  }
  const finishedAt = new Date().toISOString();
  if (!execution.ok) {
    const message = execution.error ?? "Google rejected the profile change.";
    await provider.updateProfileMutationJob(ws, created.job.id, {
      status: "failed",
      failedAt: finishedAt,
      lastError: message,
      updatedAt: finishedAt,
    });
    await provider.updateProfileSuggestion(ws, suggestionId, { status: "failed", updatedAt: finishedAt });
    await provider.appendAuditLog(ws, {
      id: `audit_${randomBytes(12).toString("hex")}`,
      workspaceId: ws,
      actor: "Foundly",
      action: "profile.change_failed",
      targetType: "profile_mutation_job",
      targetId: created.job.id,
      at: finishedAt,
      meta: { target: existing.target, error: message.slice(0, 180) },
    });
    revalidatePath("/app/this-week");
    return { ok: false, status: "failed", message };
  }

  const mutationStatus = execution.verified ? "applied" : "verification_pending";
  await provider.updateProfileMutationJob(ws, created.job.id, {
    status: mutationStatus,
    providerResponse: execution.providerResponse,
    verifiedValue: execution.verifiedValue,
    ...(execution.verified ? { appliedAt: finishedAt } : {}),
    ...(execution.error ? { lastError: execution.error } : {}),
    updatedAt: finishedAt,
  });
  await provider.updateProfileSuggestion(ws, suggestionId, { status: mutationStatus, updatedAt: finishedAt });
  await provider.appendAuditLog(ws, {
    id: `audit_${randomBytes(12).toString("hex")}`,
    workspaceId: ws,
    actor: "Foundly",
    action: execution.verified ? "profile.change_applied" : "profile.change_verification_pending",
    targetType: "profile_mutation_job",
    targetId: created.job.id,
    at: finishedAt,
    meta: { target: existing.target, verified: execution.verified },
  });
  revalidatePath("/app");
  revalidatePath("/app/this-week");
  revalidatePath("/app/settings/business");
  return {
    ok: true,
    status: mutationStatus,
    message: execution.verified
      ? "Google accepted the change and Foundly verified the new value."
      : "Google accepted the change; Foundly is waiting for the read-back value to match.",
  };
}

/**
 * Publish one exact, owner-approved post, reply, or Q&A answer. The durable
 * idempotency ledger is written before Google is called, and every successful
 * write is independently read back before Foundly marks it published.
 */
export async function approveContentSuggestionAction(
  suggestionId: string,
): Promise<ProfileSuggestionActionResult> {
  const { provider, ws, session } = await scoped("owner", "manager");
  if (session.isDemo) {
    return { ok: false, message: "Live publishing is disabled in the sample workspace." };
  }
  const limited = consumeRateLimit("content-publishing-approval", session.userId, 20, 60 * 60_000);
  if (!limited.allowed) {
    return { ok: false, message: `Publishing approvals are rate-limited. Try again in ${limited.retryAfter} seconds.` };
  }
  const data = await provider.getData(ws);
  if (!data?.location.gbpSnapshot) {
    return { ok: false, message: "Sync Google Business Profile before publishing content." };
  }
  const existing = data.location.suggestionInbox?.find((item) => item.id === suggestionId);
  if (!existing) return { ok: false, message: "This suggestion no longer exists. Refresh and try again." };
  if (!["local_post", "owner_reply", "qna"].includes(existing.kind)) {
    return { ok: false, message: "This suggestion is not a Google content publication." };
  }
  if (existing.status !== "ready_for_review" || !existing.exactPreviewReady) {
    return { ok: false, message: "Only an exact content preview that is ready for review can be approved." };
  }

  const approvedAt = new Date().toISOString();
  const approved = { ...existing, status: "approved" as const, approvedAt, approvedBy: session.name };
  const asset = existing.kind === "local_post"
    ? await provider.getAiContentAssetBySuggestion(ws, suggestionId)
    : null;
  let plan;
  try {
    const publicImageUrl = asset
      ? createSignedContentAssetUrl({
          baseUrl: await appUrl(),
          workspaceId: ws,
          assetId: asset.id,
          expiresAt: Date.now() + 24 * 60 * 60_000,
        })
      : undefined;
    plan = prepareContentPublication({
      suggestion: approved,
      snapshot: data.location.gbpSnapshot,
      asset,
      publicImageUrl,
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The exact content payload is invalid." };
  }

  const idempotencyKey = createHash("sha256")
    .update(`${ws}:${suggestionId}:${existing.kind}:${stableStringify(existing.proposedValue)}`)
    .digest("hex");
  const now = new Date().toISOString();
  const proposedJob: ContentPublishingJob = {
    id: `pub_${randomBytes(12).toString("hex")}`,
    workspaceId: ws,
    locationId: data.location.id,
    suggestionId,
    assetId: plan.assetId,
    idempotencyKey,
    kind: plan.kind,
    status: "queued",
    exactPayload: plan.body,
    attempts: 0,
    approvedAt,
    approvedBy: session.name,
    createdAt: now,
    updatedAt: now,
  };
  const created = await provider.createContentPublishingJob(ws, proposedJob);
  if (!created.created) {
    if (created.job.status === "published") {
      await provider.updateProfileSuggestion(ws, suggestionId, { status: "applied", updatedAt: now });
      return { ok: true, status: "applied", message: "This exact content was already published and verified." };
    }
    if (["failed", "rejected"].includes(created.job.status)) {
      return { ok: false, status: "failed", message: created.job.lastError ?? "The previous publication failed. Regenerate or review it before retrying." };
    }
    return {
      ok: true,
      status: created.job.status === "verification_pending" ? "verification_pending" : created.job.status === "executing" ? "executing" : "queued",
      message: "This exact content is already queued; it was not submitted twice.",
    };
  }

  await provider.updateProfileSuggestion(ws, suggestionId, {
    status: "queued",
    approvedAt,
    approvedBy: session.name,
    updatedAt: now,
  });
  await provider.appendAuditLog(ws, {
    id: `audit_${randomBytes(12).toString("hex")}`,
    workspaceId: ws,
    actor: session.name,
    action: "content.publication_approved",
    targetType: "profile_suggestion",
    targetId: suggestionId,
    at: now,
    meta: { publishingJobId: created.job.id, kind: existing.kind, exactPreviewGeneratedAt: approvedAt },
  });

  const startedAt = new Date().toISOString();
  await provider.updateContentPublishingJob(ws, created.job.id, {
    status: "executing",
    attempts: 1,
    startedAt,
    updatedAt: startedAt,
  });
  await provider.updateProfileSuggestion(ws, suggestionId, { status: "executing", updatedAt: startedAt });

  let execution;
  try {
    execution = await executeContentPublication(plan, await provider.getGoogleCredential(ws));
  } catch (error) {
    execution = { ok: false, verified: false, error: error instanceof Error ? error.message : "Google publication failed." };
  }
  const finishedAt = new Date().toISOString();
  if (!execution.ok) {
    const status = execution.rejected ? "rejected" : "failed";
    const message = execution.error ?? "Google rejected this publication.";
    await provider.updateContentPublishingJob(ws, created.job.id, {
      status,
      providerResponse: execution.providerResponse,
      providerResourceName: execution.providerResourceName,
      verifiedValue: execution.verifiedValue,
      failedAt: finishedAt,
      lastError: message,
      updatedAt: finishedAt,
    });
    await provider.updateProfileSuggestion(ws, suggestionId, { status: "failed", updatedAt: finishedAt });
    await provider.appendAuditLog(ws, {
      id: `audit_${randomBytes(12).toString("hex")}`,
      workspaceId: ws,
      actor: "Foundly",
      action: execution.rejected ? "content.publication_rejected" : "content.publication_failed",
      targetType: "content_publishing_job",
      targetId: created.job.id,
      at: finishedAt,
      meta: { kind: existing.kind, error: message.slice(0, 180) },
    });
    revalidatePath("/app/this-week");
    return { ok: false, status: "failed", message };
  }

  const jobStatus = execution.verified ? "published" : "verification_pending";
  const suggestionStatus = execution.verified ? "applied" : "verification_pending";
  await provider.updateContentPublishingJob(ws, created.job.id, {
    status: jobStatus,
    providerResponse: execution.providerResponse,
    providerResourceName: execution.providerResourceName,
    verifiedValue: execution.verifiedValue,
    ...(execution.verified ? { publishedAt: finishedAt } : {}),
    ...(execution.error ? { lastError: execution.error } : {}),
    updatedAt: finishedAt,
  });
  await provider.updateProfileSuggestion(ws, suggestionId, { status: suggestionStatus, updatedAt: finishedAt });
  await provider.appendAuditLog(ws, {
    id: `audit_${randomBytes(12).toString("hex")}`,
    workspaceId: ws,
    actor: "Foundly",
    action: execution.verified ? "content.publication_verified" : "content.publication_verification_pending",
    targetType: "content_publishing_job",
    targetId: created.job.id,
    at: finishedAt,
    meta: {
      kind: existing.kind,
      ...(execution.providerResourceName ? { providerResourceName: execution.providerResourceName } : {}),
    },
  });
  revalidatePath("/app");
  revalidatePath("/app/studio");
  revalidatePath("/app/this-week");
  revalidatePath("/app/reviews");
  return {
    ok: true,
    status: suggestionStatus,
    message: execution.verified
      ? "Google published the exact approved content and Foundly verified it."
      : execution.error ?? "Google accepted the exact content; Foundly is waiting for verification.",
  };
}

export type RankGridActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function runRankGridAction(input: {
  keyword: string;
  gridSize: number;
  radiusKm: number;
}): Promise<RankGridActionResult> {
  const { provider, ws, session } = await scoped("owner", "manager");
  const keyword = input.keyword.trim().replace(/\s+/g, " ").slice(0, 80);
  const gridSize = input.gridSize === 5 ? 5 : input.gridSize === 3 ? 3 : null;
  const radiusKm = Number(input.radiusKm);
  if (keyword.length < 2) return { ok: false, message: "Enter a keyword to scan." };
  if (!gridSize || !Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 10) {
    return { ok: false, message: "Choose a 3×3 or 5×5 grid with a 1–10 km radius." };
  }
  const data = await provider.getData(ws);
  if (!data) return { ok: false, message: "The workspace could not be loaded." };
  if (!hasFeature(data.subscription.tier, "rank_grid", data.subscription.status === "trialing")) {
    return { ok: false, message: "Rank Grid is available on Pro, Multi-location, and Agency plans." };
  }
  if (!data.location.googlePlaceId) {
    return { ok: false, message: "Find your business on Google before running a rank scan." };
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyLimit = ["multi", "agency"].includes(data.subscription.tier) ? 20 : 4;
  const scansThisMonth = data.rankScans.filter((scan) => scan.ranAt.startsWith(currentMonth)).length;
  if (!session.isDemo && scansThisMonth >= monthlyLimit) {
    return { ok: false, message: `This workspace has used all ${monthlyLimit} rank scans for this month.` };
  }

  let points: RankGridScan["points"];
  if (session.isDemo) {
    const sample = data.rankScans[0];
    points = (sample?.points ?? []).map((point) => ({ ...point }));
    if (points.length !== gridSize * gridSize) {
      points = Array.from({ length: gridSize * gridSize }, (_, index) => ({
        row: Math.floor(index / gridSize),
        col: index % gridSize,
        rank: 1 + ((index * 7) % 14),
      }));
    }
  } else {
    const { getPlaceDetails } = await import("@/lib/google/places");
    const details = await getPlaceDetails(data.location.googlePlaceId);
    if (!details.ok || !details.details.location) {
      return {
        ok: false,
        message: details.ok
          ? "Google did not return coordinates for this business. Re-select it in onboarding."
          : "Google Places could not load this business. Try again shortly.",
      };
    }
    const { scanGooglePlacesRankGrid } = await import("@/lib/google/rank-grid");
    const result = await scanGooglePlacesRankGrid({
      placeId: data.location.googlePlaceId,
      keyword,
      latitude: details.details.location.latitude,
      longitude: details.details.location.longitude,
      gridSize,
      radiusKm,
      region: data.location.region,
    });
    if (!result.ok) return { ok: false, message: result.error };
    points = result.points;
  }

  const rankingValues = points.map((point) => point.rank ?? 21);
  const scan: RankGridScan = {
    id: `rank_${randomBytes(10).toString("hex")}`,
    locationId: data.location.id,
    keyword,
    gridSize,
    radiusKm,
    source: "google_places",
    points,
    avgRank: rankingValues.reduce((sum, rank) => sum + rank, 0) / Math.max(1, points.length),
    shareOfLocalPack:
      points.filter((point) => point.rank !== null && point.rank <= 3).length /
      Math.max(1, points.length),
    ranAt: new Date().toISOString(),
  };
  await provider.saveRankGridScan(ws, scan);
  revalidatePath("/app/rank-grid");
  return {
    ok: true,
    message: session.isDemo
      ? "Demo scan refreshed with sample results."
      : `Completed ${points.length} Google Places checks for “${keyword}”.`,
  };
}

export async function updateWhiteLabelAction(config: WhiteLabelConfig) {
  const { provider, ws, session } = await scoped("owner", "agency_admin");
  const data = await provider.getData(ws);
  if (session.role !== "agency_admin" && data?.subscription.tier !== "agency") {
    throw new Error("White-label settings require the Agency plan.");
  }
  await provider.updateWhiteLabel(ws, config);
  revalidatePath("/agency", "layout");
}

export type AgencyReportSendResult = {
  ok: boolean;
  sent: number;
  skipped: number;
  failed: number;
  message: string;
};

export async function sendAgencyReportsAction(
  locationIds?: string[],
): Promise<AgencyReportSendResult> {
  const { provider, ws, session } = await scoped("owner", "agency_admin");
  const data = await provider.getData(ws);
  if (!data || (session.role !== "agency_admin" && data.subscription.tier !== "agency")) {
    return { ok: false, sent: 0, skipped: 0, failed: 0, message: "Agency reporting requires the Agency plan." };
  }
  const requested = locationIds?.length ? new Set(locationIds.slice(0, 100)) : null;
  const liveClients = await provider.listAgencyClients(ws);
  const targets = liveClients.filter(
    (client) => !requested || requested.has(client.locationId),
  );
  if (!targets.length) {
    return { ok: false, sent: 0, skipped: 0, failed: 0, message: "No matching clients were selected." };
  }

  if (session.isDemo) {
    const sentAt = new Date().toISOString();
    await provider.markAgencyReportsSent(ws, targets.map((client) => client.locationId), sentAt);
    revalidatePath("/agency", "layout");
    return {
      ok: true,
      sent: targets.length,
      skipped: 0,
      failed: 0,
      message: `Demo delivery simulated for ${targets.length} client${targets.length === 1 ? "" : "s"}.`,
    };
  }
  if (!emailEnabled()) {
    return {
      ok: false,
      sent: 0,
      skipped: targets.filter((client) => !client.contactEmail).length,
      failed: 0,
      message: "Connect Resend and a verified EMAIL_FROM address before sending client reports.",
    };
  }

  const sentIds: string[] = [];
  let skipped = 0;
  let failed = 0;
  for (const client of targets) {
    if (!client.contactEmail || !EMAIL_RE.test(client.contactEmail)) {
      skipped += 1;
      continue;
    }
    const report = agencyGrowthReportEmail({
      brandName: data.agency.whiteLabel.brandName,
      primary: data.agency.whiteLabel.primary,
      clientName: client.name,
      city: client.city,
      growthScore: client.growthScore,
      rating: client.rating,
      newReviews30d: client.newReviews30d,
      needsReply: client.needsReply,
    });
    const delivery = await sendEmail({
      to: client.contactEmail,
      subject: report.subject,
      html: report.html,
      text: report.text,
      replyTo: data.organization.billingEmail,
    });
    if (delivery.ok) sentIds.push(client.locationId);
    else failed += 1;
  }
  if (sentIds.length) {
    await provider.markAgencyReportsSent(ws, sentIds, new Date().toISOString());
    revalidatePath("/agency", "layout");
  }
  return {
    ok: failed === 0 && sentIds.length > 0,
    sent: sentIds.length,
    skipped,
    failed,
    message: sentIds.length
      ? `Sent ${sentIds.length} branded report${sentIds.length === 1 ? "" : "s"}${skipped ? `; skipped ${skipped} without a valid email` : ""}${failed ? `; ${failed} failed` : ""}.`
      : skipped
        ? "No reports were sent because the selected clients have no valid contact email."
        : "The report delivery failed. Check the Resend configuration and try again.",
  };
}

// ── Team ────────────────────────────────────────────────────
export async function inviteStaffAction(
  email: string,
  role: "manager" | "staff" = "staff",
): Promise<{ ok: boolean; error?: string; emailed?: boolean }> {
  const { provider, ws } = await scoped("owner", "manager");
  const result = await provider.createStaffInvite(ws, email, role);
  if ("error" in result) return { ok: false, error: result.error };
  revalidatePath("/app/settings/team");

  // Best-effort delivery — never blocks the invite, never fakes success.
  let emailed = false;
  if (emailEnabled()) {
    try {
      const data = await provider.getData(ws);
      if (data) {
        const base = await appUrl();
        const { subject, html } = staffInviteEmail({
          business: data.location.name,
          link: `${base}/sign-up?invite=${result.token}`,
        });
        const res = await sendEmail({ to: result.email, subject, html });
        emailed = res.ok;
      }
    } catch {
      // ignore — email is a side effect, not part of the invite contract
    }
  }
  return { ok: true, emailed };
}

export async function addStaffMemberAction(displayName: string) {
  const { provider, ws } = await scoped("owner", "manager");
  const member = await provider.addStaffMember(ws, displayName.trim());
  revalidatePath("/app/settings/team");
  revalidatePath("/staff");
  return { id: member.id };
}

// ── Notifications ───────────────────────────────────────────
export async function markNotificationsReadAction() {
  const { provider, ws } = await scoped("owner", "manager", "staff");
  await provider.markNotificationsRead(ws);
  revalidatePath("/app", "layout");
}

// ── Demo reset (demo sessions only) ─────────────────────────
export async function resetDemoAction() {
  const session = await requireSession();
  if (!session.isDemo) return; // real workspaces are never reset this way
  const provider = await getProviderFor(session);
  await provider.resetDemo();
  revalidatePath("/", "layout");
}

// ── Feature flags (admin) ───────────────────────────────────
export async function setFeatureFlagAction(key: string, enabled: boolean) {
  const { provider, ws } = await scoped("platform_admin");
  await provider.setFeatureFlag(ws, key, enabled);
  revalidatePath("/admin/flags");
  return { ok: true };
}

// ── Customer import (bulk) ──────────────────────────────────
export async function importCustomersAction(
  rows: AddCustomerInput[],
): Promise<{ added: number; skipped: number }> {
  const { provider, ws } = await scoped("owner", "manager");
  const result = await provider.addCustomersBulk(ws, rows);
  revalidatePath("/app/customers");
  return result;
}

// ── Billing / subscription ──────────────────────────────────
type BillingPortalResult =
  | { ok: true; url: string }
  | { ok: false; reason: "not_configured" | "error"; message: string };

async function billingPortal(provider: DataProvider, workspaceId: string): Promise<BillingPortalResult> {
  const data = await provider.getData(workspaceId);
  const customerId = data?.subscription.stripeCustomerId;
  if (!stripeEnabled() || !customerId) {
    return {
      ok: false,
      reason: "not_configured",
      message: "Complete a Stripe checkout before managing this subscription.",
    };
  }
  const base = await appUrl();
  const result = await createPortalSession({
    customerId,
    returnUrl: `${base}/app/settings/billing`,
  });
  return result.ok ? result : { ok: false, reason: "error", message: result.error };
}

/** Switch the signed session only after proving the target belongs to this organization. */
export async function switchWorkspaceAction(formData: FormData) {
  const { provider, ws, session } = await scoped("owner", "manager");
  const target = String(formData.get("workspaceId") ?? "").trim();
  const allowed = await provider.listOrganizationWorkspaces(ws);
  if (!allowed.some((workspace) => workspace.workspaceId === target)) {
    throw new Error("That location is not part of this organization.");
  }
  await createSession({ ...session, workspaceId: target });
  redirect("/app");
}

export async function createOrganizationWorkspaceAction(
  input: CreateOrganizationWorkspaceInput,
): Promise<{ ok: true; workspaceId: string } | { ok: false; error: string }> {
  const { provider, ws } = await scoped("owner");
  const businessName = input.businessName.trim().slice(0, 120);
  const industryKey = input.industryKey.trim().slice(0, 80);
  if (businessName.length < 2 || !industryKey) {
    return { ok: false, error: "Add a business name and industry." };
  }
  const result = await provider.createOrganizationWorkspace(ws, {
    businessName,
    industryKey,
    category: input.category.trim().slice(0, 120) || industryKey.replace(/_/g, " "),
    region: input.region === "CA" ? "CA" : "US",
    city: input.city?.trim().slice(0, 100),
    address: input.address?.trim().slice(0, 180),
  });
  if (!result.ok) return result;
  revalidatePath("/app", "layout");
  return { ok: true, workspaceId: result.workspace.workspaceId };
}

export async function createAgencyClientAction(input: {
  businessName: string;
  contactEmail: string;
  industryKey: string;
  category: string;
  region: Region;
  city?: string;
  address?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { provider, ws, session } = await scoped("owner", "agency_admin");
  const data = await provider.getData(ws);
  if (!data || (session.role !== "agency_admin" && data.subscription.tier !== "agency")) {
    return { ok: false, error: "Client management requires the Agency plan." };
  }
  const businessName = input.businessName.trim().slice(0, 120);
  const contactEmail = input.contactEmail.trim().toLowerCase().slice(0, 254);
  const industryKey = input.industryKey.trim().slice(0, 80);
  if (businessName.length < 2 || !EMAIL_RE.test(contactEmail) || !industryKey) {
    return { ok: false, error: "Add a business name, valid contact email, and industry." };
  }
  const result = await provider.createOrganizationWorkspace(ws, {
    businessName,
    contactEmail,
    industryKey,
    category: input.category.trim().slice(0, 120) || industryKey.replace(/_/g, " "),
    region: input.region === "CA" ? "CA" : "US",
    city: input.city?.trim().slice(0, 100),
    address: input.address?.trim().slice(0, 180),
  });
  if (!result.ok) return result;
  revalidatePath("/agency", "layout");
  return { ok: true };
}

export async function changePlanAction(tier: PlanTier) {
  const { provider, ws, session } = await scoped("owner");
  if (session.isDemo) {
    await provider.setSubscription(ws, { tier });
    revalidatePath("/app/settings/billing");
    return { ok: true as const };
  }
  return billingPortal(provider, ws);
}

export async function pauseSubscriptionAction() {
  const { provider, ws, session } = await scoped("owner");
  if (session.isDemo) {
    await provider.setSubscription(ws, { status: "paused" as Subscription["status"] });
    revalidatePath("/app/settings/billing");
    return { ok: true as const };
  }
  return billingPortal(provider, ws);
}

export async function downgradeToFreeAction() {
  const { provider, ws, session } = await scoped("owner");
  if (session.isDemo) {
    await provider.setSubscription(ws, { tier: "free", status: "active" });
    revalidatePath("/app/settings/billing");
    return { ok: true as const };
  }
  return billingPortal(provider, ws);
}

/**
 * Start a Stripe Checkout session for the price in `process.env[priceEnvKey]`.
 * Honest degradation: with no price configured or Stripe disabled, returns a
 * `not_configured` result so the UI can show "connect billing" instead of a
 * broken redirect.
 */
export async function startCheckoutAction(
  tier: PlanTier,
  interval: "monthly" | "annual",
): Promise<
  | { ok: true; url: string }
  | { ok: false; reason: "not_configured" | "error"; message: string }
> {
  const { session, provider, ws } = await scoped("owner");
  const allowed = ["starter", "growth", "pro", "multi", "agency"] as const;
  if (!allowed.includes(tier as (typeof allowed)[number])) {
    return { ok: false, reason: "error", message: "That plan is not available for checkout." };
  }
  const suffix = interval === "annual" ? "ANNUAL" : "MONTHLY";
  const baseKey = `STRIPE_PRICE_${tier.toUpperCase()}`;
  const priceId =
    process.env[`${baseKey}_${suffix}`] ||
    (interval === "monthly" ? process.env[baseKey] : undefined);
  if (!priceId || !stripeEnabled()) {
    return {
      ok: false,
      reason: "not_configured",
      message: `Connect the ${interval} Stripe price for ${tier} to enable checkout.`,
    };
  }
  const base = await appUrl();
  const data = await provider.getData(ws);
  const res = await createCheckoutSession({
    priceId,
    customerEmail: session.email,
    customerId: data?.subscription.stripeCustomerId,
    successUrl: `${base}/app/settings/billing?checkout=success`,
    cancelUrl: `${base}/app/settings/billing?checkout=cancelled`,
    workspaceId: ws,
    tier: tier as Exclude<PlanTier, "free">,
    interval,
  });
  if (!res.ok) {
    return { ok: false, reason: "error", message: res.error };
  }
  return { ok: true, url: res.url };
}

/**
 * Open the Stripe Billing Portal. No Stripe customer id is persisted yet, so
 * this stays honestly `not_configured` until that wiring lands (or Stripe is
 * disabled).
 */
export async function openBillingPortalAction(): Promise<BillingPortalResult> {
  const { provider, ws } = await scoped("owner");
  return billingPortal(provider, ws);
}

export type { Channel };
