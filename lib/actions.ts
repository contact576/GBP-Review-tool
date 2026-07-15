"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getSession,
  createSession,
  createDemoSession,
  clearSession,
  type SessionRole,
  type Session,
} from "@/lib/auth/session";
import { getProviderFor, getPublicProviders, getRealProvider } from "@/lib/data";
import { validatePasswordStrength } from "@/lib/auth/password";
import type {
  CaptureCustomerInput,
  SendRequestInput,
  CreateCampaignInput,
  PostReplyInput,
  AddCustomerInput,
  CreateTaskInput,
  GoogleLocationPatch,
} from "@/lib/data/provider";
import type {
  CustomerConsent,
  ReplyTone,
  Channel,
  Region,
  WhiteLabelConfig,
  WorkspaceSettings,
  IndustryConfig,
} from "@/lib/data/types";

// ── Helpers ─────────────────────────────────────────────────
async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

async function scoped() {
  const session = await requireSession();
  const provider = await getProviderFor(session);
  return { session, provider, ws: session.workspaceId };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
}): Promise<AuthFormResult> {
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
  const { provider, ws } = await scoped();
  const result = await provider.captureCustomer(ws, input);
  revalidatePath("/app");
  revalidatePath("/app/requests");
  revalidatePath("/app/customers");
  revalidatePath("/staff");
  return { token: result.request.token, customerName: result.customer.name };
}

export async function addCustomerAction(input: AddCustomerInput) {
  const { provider, ws } = await scoped();
  const customer = await provider.addCustomer(ws, input);
  revalidatePath("/app/customers");
  return { id: customer.id };
}

export async function sendRequestAction(input: SendRequestInput) {
  const { provider, ws } = await scoped();
  const req = await provider.sendRequest(ws, input);
  revalidatePath("/app/requests");
  revalidatePath("/app/customers");
  return { token: req.token };
}

// Public (token-keyed, no session) — used by the customer review flow.
export async function advanceRequestAction(
  token: string,
  to: "opened" | "clicked" | "posted_google" | "private_feedback",
  meta?: { rating?: 1 | 2 | 3 | 4 | 5; attributes?: string[] },
) {
  for (const provider of await getPublicProviders()) {
    const result = await provider.advanceRequest(token, to, meta);
    if (result) break;
  }
  revalidatePath("/app");
  revalidatePath("/app/requests");
}

export async function submitPrivateFeedbackAction(input: {
  token: string;
  rating: 1 | 2 | 3;
  text: string;
}) {
  for (const provider of await getPublicProviders()) {
    const found = await provider.getRequestByToken(input.token);
    if (found) {
      await provider.submitPrivateFeedback(input);
      break;
    }
  }
  revalidatePath("/app");
}

export async function resolveFeedbackAction(feedbackId: string) {
  const { provider, ws } = await scoped();
  await provider.resolvePrivateFeedback(ws, feedbackId);
  revalidatePath("/app");
}

// ── Co-Pilot ────────────────────────────────────────────────
export async function approveTaskAction(taskId: string) {
  const { provider, ws } = await scoped();
  await provider.approveTask(ws, taskId);
  revalidatePath("/app");
  revalidatePath("/app/this-week");
}

export async function snoozeTaskAction(taskId: string) {
  const { provider, ws } = await scoped();
  await provider.snoozeTask(ws, taskId);
  revalidatePath("/app/this-week");
}

export async function createTaskAction(input: CreateTaskInput) {
  const { provider, ws } = await scoped();
  const task = await provider.createGbpTask(ws, input);
  revalidatePath("/app/this-week");
  return { id: task.id };
}

// ── Reviews ─────────────────────────────────────────────────
export async function postReplyAction(input: PostReplyInput & { tone: ReplyTone }) {
  const { provider, ws } = await scoped();
  await provider.postReply(ws, input);
  revalidatePath("/app/reviews");
  revalidatePath("/app");
}

// ── Campaigns ───────────────────────────────────────────────
export async function createCampaignAction(input: CreateCampaignInput) {
  const { provider, ws } = await scoped();
  const c = await provider.createCampaign(ws, input);
  revalidatePath("/app/campaigns");
  return { id: c.id, consented: c.audienceConsented, total: c.audienceTotal };
}

export async function setCampaignStatusAction(campaignId: string, status: "active" | "paused") {
  const { provider, ws } = await scoped();
  await provider.setCampaignStatus(ws, campaignId, status);
  revalidatePath("/app/campaigns");
}

// ── Consent ─────────────────────────────────────────────────
export async function updateConsentAction(
  customerId: string,
  consent: Partial<CustomerConsent>,
) {
  const { provider, ws } = await scoped();
  await provider.updateConsent(ws, customerId, consent);
  revalidatePath("/app/customers");
}

// ── Workspace configuration ─────────────────────────────────
export async function updateIndustryAction(industryKey: string, config?: IndustryConfig) {
  const { provider, ws } = await scoped();
  await provider.updateIndustry(ws, industryKey, config);
  revalidatePath("/", "layout");
}

export async function updateWorkspaceSettingsAction(patch: Partial<WorkspaceSettings>) {
  const { provider, ws } = await scoped();
  await provider.updateWorkspaceSettings(ws, patch);
  revalidatePath("/app/settings", "layout");
}

export async function updateLocationGoogleAction(patch: GoogleLocationPatch) {
  const { provider, ws } = await scoped();
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
}

/**
 * Pull real Google data into the workspace:
 *  - public data (aggregate rating/count + review sample) via Places — works now
 *  - full profile (all reviews + performance) via GBP — imports once Google
 *    approves the project; reports honestly as pending until then.
 */
export async function syncGoogleAction(): Promise<GoogleSyncActionResult> {
  const { provider, ws, session } = await scoped();
  if (session.isDemo) {
    return { ok: false, message: "The demo uses sample data — sign up to sync your real Google data." };
  }

  const pub = await provider.syncGooglePublic(ws);
  const profile = await provider.syncGoogleProfile(ws);

  revalidatePath("/app");
  revalidatePath("/app/reviews");
  revalidatePath("/app/settings/integrations");

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
      message: `Imported ${profile.reviewsImported ?? 0} reviews from your Google Business Profile (${(profile.rating ?? pub.rating ?? 0).toFixed(1)}★).`,
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

export async function updateWhiteLabelAction(config: WhiteLabelConfig) {
  const { provider, ws } = await scoped();
  await provider.updateWhiteLabel(ws, config);
  revalidatePath("/agency", "layout");
}

// ── Team ────────────────────────────────────────────────────
export async function inviteStaffAction(
  email: string,
  role: "manager" | "staff" = "staff",
): Promise<{ ok: boolean; error?: string }> {
  const { provider, ws } = await scoped();
  const result = await provider.createStaffInvite(ws, email, role);
  if ("error" in result) return { ok: false, error: result.error };
  revalidatePath("/app/settings/team");
  return { ok: true };
}

export async function addStaffMemberAction(displayName: string) {
  const { provider, ws } = await scoped();
  const member = await provider.addStaffMember(ws, displayName.trim());
  revalidatePath("/app/settings/team");
  revalidatePath("/staff");
  return { id: member.id };
}

// ── Notifications ───────────────────────────────────────────
export async function markNotificationsReadAction() {
  const { provider, ws } = await scoped();
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

export type { Channel };
