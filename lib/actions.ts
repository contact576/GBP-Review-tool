"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  getSession,
  createSession,
  createDemoSession,
  clearSession,
  type SessionRole,
  type Session,
} from "@/lib/auth/session";
import { homeWorkspaceIdFor, getProviderFor, getPublicProviders, getRealProvider, type DataProvider } from "@/lib/data";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { isPlausibleNameMatch, searchBusinesses } from "@/lib/google/places";
import { createEmailVerificationToken } from "@/lib/auth/email-verification";
import {
  stripeEnabled,
  createCheckoutSession,
  createPortalSession,
} from "@/lib/billing/stripe";
import { emailEnabled, emailEnabledFor, sendEmail } from "@/lib/email";
import {
  readEmailSettings,
  saveEmailSettings,
  deleteEmailSettings,
  recordEmailTestResult,
  type EmailProvider,
  type EmailSettingsView,
} from "@/lib/email/config";
import {
  agencyGrowthReportEmail,
  clientInviteEmail,
  emailTestEmail,
  passwordResetEmail,
  reviewRequestEmail,
  staffInviteEmail,
  verificationEmail,
  welcomeEmail,
} from "@/lib/email/templates";
import { historyRecordFrom } from "@/lib/platform/retention";
import { reviewRequestSms } from "@/lib/sms/templates";
import { sendSms, smsEnabled } from "@/lib/sms/twilio";
import { canonicalPhone, isE164 } from "@/lib/sms/phone";
import { toWhatsAppNumber } from "@/lib/whatsapp/link";
import { appUrl } from "@/lib/utils/app-url";
import { consumeRateLimit } from "@/lib/security/api";
import { trustedClientIp } from "@/lib/security/client-ip";
import { parseReferralCode } from "@/lib/referrals/code";
import { PLAN_ORDER, TRIAL_DAYS } from "@/lib/billing/plans";
import { isTrialExpired, subscriptionHasFeature } from "@/lib/billing/trial";
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
  CampaignDeliveryState,
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
  RankGridResult,
  ProfileMutationJob,
  ContentPublishingJob,
  ProfileSuggestionStatus,
  AiContentAsset,
  ProfileSuggestion,
  FraudTriageDecision,
} from "@/lib/data/types";
import { prepareProfileMutation, stableStringify } from "@/lib/google/profile-mutation";
import { executeProfileMutation } from "@/lib/google/mutation-runner";
import { runLints } from "@/lib/compliance/lints";
import { checkQuietHours } from "@/lib/compliance/quiet-hours";
import {
  commitCampaignSend,
  scheduleCampaign,
  sendCampaignTest,
} from "@/lib/campaigns/runner";
import {
  suggestionToGenerationKind,
  MANUAL_CONTENT_KINDS,
  isManualContentKind,
  manualContentKindLabel,
  type ContentSuggestionPreview,
  type GroundedContentInput,
  type ManualContentKind,
} from "@/lib/ai/content-studio";
import { generateGroundedContentText, generateLocalPostImage } from "@/lib/ai/openai-content";
import {
  prepareContentPublication,
  prepareOwnerReplyPublication,
  decideOwnerReplyPublication,
  resolveReplyPublishOutcome,
  type PreparedContentPublication,
  type ReplyPublishOutcome,
} from "@/lib/google/content-publishing";
import { executeContentPublication } from "@/lib/google/content-publish-runner";
import { awardMilestones } from "@/lib/milestones/runner";
import { createSignedContentAssetUrl } from "@/lib/security/content-asset-signature";
import {
  normalizeOwnerServices,
  ownerServicesProblem,
} from "@/components/app/business-services";

// ── Helpers ─────────────────────────────────────────────────
async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

async function requireRole(...allowed: SessionRole[]): Promise<Session> {
  const session = await requireSession();
  if (allowed.includes(session.role)) return session;
  // An agency admin inside a client workspace, or a platform admin inside a
  // tenant they opened from the ops console, acts as that workspace's owner:
  // every owner action is theirs to take, on that workspace's data only. The
  // session keeps its real role, so nothing here changes who they are.
  const acting =
    (session.role === "agency_admin" || session.role === "platform_admin") && Boolean(session.homeWorkspaceId);
  if (acting && allowed.includes("owner")) {
    return session;
  }
  throw new Error("Forbidden");
}

async function scoped(...allowed: SessionRole[]) {
  const session = await requireRole(...allowed);
  const provider = await getProviderFor(session);
  return { session, provider, ws: session.workspaceId };
}

/**
 * Like `scoped`, but `ws` is the AGENCY's own workspace even while the admin is
 * working inside a client (see `homeWorkspaceIdFor`). Every action that
 * edits the agency itself — its clients, white-label, reports — goes through
 * here so it can never land on whichever client happens to be open.
 */
async function agencyScoped(...allowed: SessionRole[]) {
  const session = await requireRole(...allowed);
  const provider = await getProviderFor(session);
  return { session, provider, ws: homeWorkspaceIdFor(session) };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function deliverReviewRequest(
  provider: DataProvider,
  ws: string,
  request: { id: string; token: string; channel: Channel; customerName: string },
  customer?: Pick<Customer, "email" | "phone" | "consent" | "suppressedReason">,
  simulate = false,
): Promise<"sent" | "failed" | "suppressed" | "held"> {
  let status: "sent" | "failed" | "suppressed" | "held" = "failed";
  let reason: string | undefined;
  // Email can be switched on per workspace (Settings → Channels) or at the env
  // level, so the capability check is workspace-scoped rather than global.
  const canEmail = simulate ? false : await emailEnabledFor(ws);
  if (simulate) {
    status = "sent";
  } else if (canEmail && !(await provider.isWorkspaceEmailVerified(ws))) {
    // V17: an account whose email is not yet confirmed cannot send outbound
    // messages. Reuses the existing "suppressed" delivery state, so the request
    // is recorded honestly rather than silently sent from an unverified account.
    status = "suppressed";
    reason = "Confirm your account email to start sending review requests.";
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
    } else if (request.channel === "whatsapp") {
      // WhatsApp is a manual, no-API channel: the message is composed here but
      // the owner sends it from WhatsApp Web themselves. Nothing to deliver
      // server-side, so the request stays queued until they confirm the send
      // (see markWhatsAppRequestSentAction).
      status = "failed";
      reason = "Open this request in WhatsApp to send it.";
    } else if (request.channel === "email" && customer.email && canEmail && data) {
      try {
        const base = await appUrl();
        const { subject, html } = reviewRequestEmail({
          business: data.location.name,
          customerName: request.customerName,
          link: `${base}/r/${request.token}`,
        });
        const result = await sendEmail({
          to: customer.email,
          subject,
          html,
          workspaceId: ws,
        });
        status = result.ok ? "sent" : "failed";
        if (!result.ok) {
          reason =
            result.reason === "not_configured"
              ? "Connect an email sender in Settings → Channels."
              : result.detail;
        }
      } catch {
        status = "failed";
      }
    } else if (request.channel === "sms" && customer.phone && smsEnabled() && data) {
      // Quiet hours (TCPA/CASL) are measured in the RECIPIENT's local time —
      // the location's timezone, not the server's. Checked before spending a
      // credit or touching Twilio.
      const quiet = checkQuietHours({
        enabled: data.workspace.settings?.quietHours !== false,
        timezone: data.location.timezone || data.workspace.timezone,
        at: new Date(),
      });
      if (!quiet.allowed) {
        status = "held";
        reason = quiet.reason;
      } else if (!isE164(customer.phone)) {
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
  // A held request keeps the queued state it was created with: nothing was
  // delivered, so there is no delivery outcome to record. It goes out on the
  // next send attempt that falls inside the recipient's local window.
  if (status !== "held") {
    await provider.setRequestDeliveryStatus(ws, request.id, status, reason);
  }
  return status;
}

async function requestIdentity(): Promise<string> {
  const store = await headers();
  // Trusted-proxy IP derivation (V3) — see lib/security/client-ip.ts.
  return trustedClientIp((name) => store.get(name));
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
  /**
   * Where this account's console lives (/app, /agency or /admin). The form
   * navigates straight there: pushing "/app" and letting the middleware bounce
   * an admin to their console left the client router with a redirect it never
   * committed, so admins stayed on the sign-in page with a valid session.
   */
  home?: string;
}

function consoleHomeFor(role: SessionRole): string {
  if (role === "platform_admin") return "/admin";
  if (role === "agency_admin") return "/agency";
  return "/app";
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
    sessionVersion: result.user.sessionVersion ?? 0,
  });

  // Welcome email: the trial length and the three steps that make it pay off.
  // Fire-and-forget — `after` runs once the response is sent, so sign-up never
  // waits on a mail API, and `sendEmail` returns a result rather than
  // throwing, so it can never fail the registration either way.
  after(async () => {
    try {
      const base = await appUrl();
      const template = welcomeEmail({
        firstName: name.split(" ")[0] || undefined,
        business: businessName,
        trialDays: TRIAL_DAYS,
        links: {
          linkBusiness: `${base}/app/settings/business`,
          connectGoogle: `${base}/app/settings/integrations`,
          sendRequest: `${base}/app/requests`,
        },
      });
      await sendEmail({
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        workspaceId: result.user.workspaceId,
      });
    } catch {
      // a welcome note is a courtesy, never part of the registration contract
    }
  });

  // V17: when email delivery is configured, require the registrant to confirm
  // their address before the workspace can send review requests. Best-effort —
  // a delivery failure never blocks registration; the account simply stays
  // unverified until it can be confirmed. When email is NOT configured we cannot
  // verify anything, so the account remains usable (registerUser sets verified).
  if (emailEnabled()) {
    try {
      await provider.setEmailVerified(result.user.id, false);
      const token = createEmailVerificationToken(result.user.id);
      const base = await appUrl();
      const template = verificationEmail({ link: `${base}/verify-email?token=${encodeURIComponent(token)}` });
      await sendEmail({ to: email, subject: template.subject, html: template.html });
    } catch {
      // ignore — verification is a side effect, not part of the registration contract
    }
  }
  return { ok: true };
}

// ── Auth: sign in ───────────────────────────────────────────
export async function loginAction(input: {
  email: string;
  password: string;
}): Promise<AuthFormResult> {
  const email = input.email.trim().toLowerCase();
  const identity = await requestIdentity();
  // Keyed on email AND caller, never on email alone.
  //
  // The per-email bucket used to be keyed on the email by itself, which turns a
  // brute-force guard into a lockout weapon: anyone who knows your address can
  // spend 10 wrong guesses and hold you out of your own account for the rest of
  // the window, from anywhere, while you type the correct password. Scoping the
  // strict bucket to the caller keeps guessing against one account expensive
  // without letting a stranger's attempts spend a legitimate user's budget. The
  // wider per-IP bucket below still caps someone spraying many accounts at once.
  const loginByEmail = consumeRateLimit(
    "auth-login-email",
    `${email || "missing"}|${identity}`,
    10,
    10 * 60_000,
  );
  const loginByIp = consumeRateLimit("auth-login-ip", identity, 100, 10 * 60_000);
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
    sessionVersion: user.sessionVersion ?? 0,
  });
  return { ok: true, home: consoleHomeFor(user.role) };
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

/**
 * Explicit demo entry — sessions are flagged isDemo and use seeded data only.
 *
 * V16: the role argument arrives from the client, so it is validated against an
 * explicit allowlist rather than trusted. Demo sessions can never reach real
 * tenant data (getProviderFor forces the in-memory store for isDemo) and can
 * never run the production setup surface (which requires a real, non-demo
 * platform_admin), so the showcase roles are safe to offer — but an unexpected
 * or malformed role value is rejected outright.
 */
const DEMO_ROLES = new Set<SessionRole>([
  "owner",
  "manager",
  "staff",
  "agency_admin",
  "platform_admin",
]);

export async function enterDemoAction(role: SessionRole = "owner") {
  const safeRole: SessionRole = DEMO_ROLES.has(role) ? role : "owner";
  await createDemoSession(safeRole);
}

export async function signOutAction() {
  await clearSession();
  redirect("/sign-in");
}

/**
 * Sign out of every device (V8). Bumps the user's session-version so all
 * outstanding JWTs are revoked, then clears this device's cookie. Demo sessions
 * have no durable user row, so this is a no-op beyond the local cookie clear.
 */
export async function signOutEverywhereAction() {
  const session = await getSession();
  if (session && !session.isDemo) {
    const provider = await getRealProvider();
    await provider.bumpUserSessionVersion(session.userId);
  }
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

// ── WhatsApp (manual, no API) ───────────────────────────────

/**
 * WhatsApp is the one channel Foundly cannot deliver on the user's behalf, by
 * design: it rides WhatsApp's public click-to-chat links rather than the
 * Business API, so the owner presses send in their own WhatsApp.
 *
 * That splits the work in two. This action mints the review links up front
 * (one token per customer, so opens and posted reviews still attribute
 * correctly), and `markWhatsAppRequestSentAction` records the send once the
 * owner confirms it. A request the owner skips simply stays "queued" — the
 * ledger never claims a message that was never sent.
 */
export interface WhatsAppRecipient {
  customerId: string;
  requestId: string;
  name: string;
  /** Digits-only international number, ready for a wa.me link. */
  phone: string;
  phoneDisplay: string;
  /** Their unique review link. */
  link: string;
}

export interface PrepareWhatsAppResult {
  recipients: WhatsAppRecipient[];
  business: string;
  /** Customers that were requested but couldn't be prepared, with the reason. */
  skipped: { customerId: string; name: string; reason: string }[];
}

export async function prepareWhatsAppRequestsAction(input: {
  locationId: string;
  customerIds: string[];
}): Promise<PrepareWhatsAppResult> {
  const { provider, ws } = await scoped("owner", "manager", "staff");

  const ids = Array.from(
    new Set(
      (Array.isArray(input.customerIds) ? input.customerIds : [])
        .filter((id): id is string => typeof id === "string")
        .slice(0, 200),
    ),
  );
  if (ids.length === 0) return { recipients: [], business: "", skipped: [] };

  const data = await provider.getData(ws);
  if (!data) throw new Error("Workspace not found");

  const base = await appUrl();
  const region = data.workspace.region;
  const recipients: WhatsAppRecipient[] = [];
  const skipped: PrepareWhatsAppResult["skipped"] = [];

  for (const customerId of ids) {
    const customer = data.customers.find((item) => item.id === customerId);
    if (!customer) {
      skipped.push({ customerId, name: "Customer", reason: "No longer in this workspace." });
      continue;
    }
    if (customer.suppressedReason) {
      skipped.push({ customerId, name: customer.name, reason: customer.suppressedReason });
      continue;
    }
    if (!customer.consent.serviceConsent || customer.consent.withdrawnAt) {
      skipped.push({
        customerId,
        name: customer.name,
        reason: "No service-message consent on file.",
      });
      continue;
    }
    const number = toWhatsAppNumber(customer.phone, region);
    if (!number) {
      skipped.push({
        customerId,
        name: customer.name,
        reason: customer.phone ? "That phone number isn't dialable." : "No phone number on file.",
      });
      continue;
    }

    const request = await provider.sendRequest(ws, {
      locationId: input.locationId,
      customerId,
      channel: "whatsapp",
    });
    recipients.push({
      customerId,
      requestId: request.id,
      name: customer.name,
      phone: number.digits,
      phoneDisplay: number.display,
      link: `${base}/r/${request.token}`,
    });
  }

  revalidatePath("/app/requests");
  revalidatePath("/app/customers");
  return { recipients, business: data.location.name, skipped };
}

/**
 * Confirm the owner actually pressed send in WhatsApp. Only ever called from
 * the queue UI after the chat was opened — never on our own initiative.
 */
export async function markWhatsAppRequestSentAction(
  requestId: string,
): Promise<{ ok: boolean }> {
  const { provider, ws } = await scoped("owner", "manager", "staff");
  if (typeof requestId !== "string" || !requestId) return { ok: false };
  const updated = await provider.setRequestDeliveryStatus(ws, requestId, "sent");
  revalidatePath("/app/requests");
  revalidatePath("/app");
  return { ok: Boolean(updated) };
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
export interface PostReplyActionResult extends ReplyPublishOutcome {
  /** The reply was durably saved in Foundly (independent of Google). */
  saved: boolean;
}

/**
 * Save an owner reply and — when the workspace genuinely can — publish it to
 * Google Business Profile.
 *
 * Order matters: the owner's words are persisted FIRST, so a pending API
 * approval, a missing credential or a Google outage can never lose them. Only
 * then does {@link decideOwnerReplyPublication} decide whether a real write is
 * even possible; when it is, the reply goes through the exact same prepared
 * plan, idempotency ledger, read-after-write verification and audit rows the
 * governed suggestion-inbox approval uses.
 *
 * The returned message is the literal truth in every branch — a reply is only
 * ever described as posted when Google returned it on a fresh read-back.
 */
export async function postReplyAction(
  input: PostReplyInput & { tone: ReplyTone },
): Promise<PostReplyActionResult> {
  const { provider, ws, session } = await scoped("owner", "manager");
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) {
    return {
      saved: false,
      state: "failed",
      publishedToGoogle: false,
      message: "Write a reply before saving it.",
    };
  }

  // 1 — durable local save, always.
  await provider.postReply(ws, { ...input, text });
  revalidatePath("/app/reviews");
  revalidatePath("/app");

  // 2 — may we write to Google at all? Demo workspaces are refused outright.
  const data = await provider.getData(ws);
  const snapshot = data?.location.gbpSnapshot ?? null;
  const credential = session.isDemo ? null : await provider.getGoogleCredential(ws);
  const decision = decideOwnerReplyPublication({
    isDemo: session.isDemo,
    hasGoogleCredential: Boolean(credential),
    snapshot,
    reviewId: input.reviewId,
  });
  if (!decision.publish) {
    return { saved: true, ...resolveReplyPublishOutcome({ kind: "blocked", block: decision.block }) };
  }
  // A publishable decision implies both of these; the guard keeps it provable.
  if (!data || !snapshot) {
    return { saved: true, ...resolveReplyPublishOutcome({ kind: "blocked", block: "profile_not_synced" }) };
  }
  const limited = consumeRateLimit("owner-reply-publishing", session.userId, 30, 60 * 60_000);
  if (!limited.allowed) {
    return { saved: true, ...resolveReplyPublishOutcome({ kind: "blocked", block: "rate_limited" }) };
  }

  // 3 — same request builder as the governed approval path.
  let plan: PreparedContentPublication;
  try {
    plan = prepareOwnerReplyPublication({ snapshot, reviewId: input.reviewId, comment: text });
  } catch (error) {
    return {
      saved: true,
      ...resolveReplyPublishOutcome({
        kind: "executed",
        ok: false,
        verified: false,
        error: error instanceof Error ? error.message : "The exact reply payload is invalid.",
      }),
    };
  }

  // 4 — same ledger, execution, verification and audit rows.
  const approvedAt = new Date().toISOString();
  const run = await runContentPublication({
    provider,
    ws,
    locationId: data.location.id,
    actor: session.name,
    publicationRef: input.reviewId,
    plan,
    idempotencyKey: createHash("sha256")
      .update(`${ws}:owner_reply:${input.reviewId}:${stableStringify(text)}`)
      .digest("hex"),
    approvedAt,
    approvalAudit: {
      action: "content.publication_approved",
      targetType: "review",
      targetId: input.reviewId,
      meta: { kind: "owner_reply", tone: input.tone, surface: "reviews_inbox" },
    },
    resultMeta: { kind: "owner_reply", reviewId: input.reviewId },
  });

  revalidatePath("/app/reviews");
  revalidatePath("/app");
  const outcome = run.kind === "already_published"
    ? resolveReplyPublishOutcome({ kind: "already_published" })
    : run.kind === "in_flight"
      ? resolveReplyPublishOutcome({ kind: "in_flight" })
      : run.kind === "previous_failure"
        ? resolveReplyPublishOutcome({ kind: "executed", ok: false, verified: false, error: run.error })
        : resolveReplyPublishOutcome({ kind: "executed", ok: run.ok, verified: run.verified, error: run.error });
  return { saved: true, ...outcome };
}

// ── Campaigns ───────────────────────────────────────────────

/**
 * Campaign delivery.
 *
 * Every action below returns a truthful outcome rather than throwing on a
 * refusal, because the honest answers here ("we did not send — email is not
 * connected", "this would use 480 of your 182 remaining credits") are results
 * the owner needs to read, not errors to swallow. The one thing none of these
 * may ever do is report a send that did not happen.
 */
export interface CampaignSendActionResult {
  ok: boolean;
  campaignId: string;
  state: CampaignDeliveryState;
  note: string;
  missing?: string[];
  counts: { sent: number; failed: number; skipped: number; held: number };
  eligible: number;
}

function revalidateCampaigns(campaignId?: string): void {
  revalidatePath("/app/campaigns");
  if (campaignId) revalidatePath(`/app/campaigns/${campaignId}`);
}

export async function createCampaignAction(input: CreateCampaignInput) {
  const { provider, ws } = await scoped("owner", "manager");
  const c = await provider.createCampaign(ws, input);
  revalidateCampaigns(c.id);
  return { id: c.id, consented: c.audienceConsented, total: c.audienceTotal };
}

export async function setCampaignStatusAction(campaignId: string, status: "active" | "paused") {
  const { provider, ws } = await scoped("owner", "manager");
  await provider.setCampaignStatus(ws, campaignId, status);
  revalidateCampaigns(campaignId);
}

/** Freeze the audience and deliver now, over Resend/Twilio. */
export async function sendCampaignAction(campaignId: string): Promise<CampaignSendActionResult> {
  const { provider, ws } = await scoped("owner", "manager");
  const result = await commitCampaignSend({
    provider,
    workspaceId: ws,
    campaignId,
    baseUrl: await appUrl(),
  });
  revalidateCampaigns(campaignId);
  revalidatePath("/app/settings/billing");
  return {
    ok: result.ok,
    campaignId,
    state: result.state,
    note: result.note,
    missing: result.missing,
    counts: result.counts,
    eligible: result.eligible,
  };
}

/** Save the draft, then immediately attempt delivery in the same round trip. */
export async function createAndSendCampaignAction(
  input: CreateCampaignInput,
): Promise<CampaignSendActionResult> {
  const { provider, ws } = await scoped("owner", "manager");
  const campaign = await provider.createCampaign(ws, input);
  const result = await commitCampaignSend({
    provider,
    workspaceId: ws,
    campaignId: campaign.id,
    baseUrl: await appUrl(),
  });
  revalidateCampaigns(campaign.id);
  revalidatePath("/app/settings/billing");
  return {
    ok: result.ok,
    campaignId: campaign.id,
    state: result.state,
    note: result.note,
    missing: result.missing,
    counts: result.counts,
    eligible: result.eligible,
  };
}

export async function scheduleCampaignAction(input: {
  campaignId: string;
  scheduledAt: string;
}): Promise<{ ok: boolean; note: string; eligible: number; scheduledAt?: string }> {
  const { provider, ws } = await scoped("owner", "manager");
  const result = await scheduleCampaign({
    provider,
    workspaceId: ws,
    campaignId: input.campaignId,
    scheduledAt: input.scheduledAt,
  });
  revalidateCampaigns(input.campaignId);
  return result;
}

/** Save a draft and schedule it in one step, from the composer. */
export async function createAndScheduleCampaignAction(
  input: CreateCampaignInput & { scheduledAt: string },
): Promise<{ ok: boolean; note: string; eligible: number; campaignId?: string; scheduledAt?: string }> {
  const { provider, ws } = await scoped("owner", "manager");
  const campaign = await provider.createCampaign(ws, { ...input, scheduledAt: undefined });
  const result = await scheduleCampaign({
    provider,
    workspaceId: ws,
    campaignId: campaign.id,
    scheduledAt: input.scheduledAt,
  });
  revalidateCampaigns(campaign.id);
  return { ...result, campaignId: campaign.id };
}

/**
 * One copy to the owner. Never counted as a campaign send, never charged to
 * the SMS allowance, and never delivered to a customer.
 */
export async function testSendCampaignAction(input: {
  name: string;
  channel: Channel;
  subject?: string;
  body: string;
  destination?: string;
}): Promise<{ ok: boolean; note: string; missing?: string[] }> {
  const { provider, ws } = await scoped("owner", "manager");
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body) return { ok: false, note: "Write a message before sending a test." };
  return sendCampaignTest({
    provider,
    workspaceId: ws,
    draft: {
      name: input.name?.trim() || "Test campaign",
      channel: input.channel,
      subject: input.subject?.trim(),
      body,
    },
    destination: input.destination?.trim(),
    baseUrl: await appUrl(),
  });
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

export type BusinessServicesActionResult =
  | { ok: true; message: string; services: string[] }
  | { ok: false; message: string };

/**
 * The owner's own service list (Settings → Business).
 *
 * This is the middle tier of `resolveServiceOptions`: it sits behind whatever
 * the connected Google profile publishes and in front of the static industry
 * catalog, so saving here replaces guessed catalog defaults on the customer
 * review page and in the AI-Visibility question set.
 *
 * It writes nothing to Google. `provider.updateIndustry` is the only writer of
 * `industryConfig`, so the workspace's existing industry key, custom label and
 * custom attributes are read back and re-sent unchanged — only the service list
 * moves. No business-name field is touched anywhere in this path.
 */
export async function updateBusinessServicesAction(
  services: unknown,
): Promise<BusinessServicesActionResult> {
  const { provider, ws, session } = await scoped("owner", "manager");
  if (!Array.isArray(services)) {
    return { ok: false, message: "That service list could not be read." };
  }
  const normalized = normalizeOwnerServices(
    services.map((entry) => (typeof entry === "string" ? entry : "")),
  );
  const problem = ownerServicesProblem(normalized);
  if (problem) return { ok: false, message: problem };

  const data = await provider.getData(ws);
  if (!data) return { ok: false, message: "This workspace could not be loaded." };

  // `updateIndustry` also stamps the industry key onto the workspace and its
  // location, so the current key has to be re-sent verbatim or saving a service
  // list would silently clear the industry the owner picked.
  const industryKey = (data.workspace.vertical || data.location.vertical || "").trim();
  if (!industryKey) {
    return {
      ok: false,
      message: "Choose a business type before saving services.",
    };
  }

  const existing = data.workspace.industryConfig;
  const config: IndustryConfig = {
    ...(existing?.customLabel ? { customLabel: existing.customLabel } : {}),
    ...(existing?.customAttributes?.length
      ? { customAttributes: existing.customAttributes }
      : {}),
    ...(normalized.services.length ? { customServices: normalized.services } : {}),
  };

  await provider.updateIndustry(ws, industryKey, config);
  await provider.appendAuditLog(ws, {
    id: `audit_${randomBytes(12).toString("hex")}`,
    workspaceId: ws,
    actor: session.name,
    action: "business.services_updated",
    targetType: "workspace",
    targetId: ws,
    at: new Date().toISOString(),
    meta: { serviceCount: normalized.services.length },
  });

  revalidatePath("/app/settings/business");
  revalidatePath("/", "layout");

  const duplicateNote =
    normalized.duplicatesRemoved > 0
      ? ` ${normalized.duplicatesRemoved} repeated ${normalized.duplicatesRemoved === 1 ? "entry was" : "entries were"} removed.`
      : "";
  const message =
    normalized.services.length === 0
      ? "Service list cleared. Nothing of your own is saved now."
      : `${normalized.services.length} ${normalized.services.length === 1 ? "service" : "services"} saved.${duplicateNote}`;
  return { ok: true, message, services: normalized.services };
}

export async function updateWorkspaceSettingsAction(patch: Partial<WorkspaceSettings>) {
  const { provider, ws } = await scoped("owner");
  await provider.updateWorkspaceSettings(ws, patch);
  revalidatePath("/app/settings", "layout");
}

export async function updateLocationGoogleAction(patch: GoogleLocationPatch) {
  const { provider, ws } = await scoped("owner", "manager");
  // V12: this patch feeds the PUBLIC widget's displayed "Google" rating/review
  // count, so it must be validated — an unvalidated patch let a tenant publish a
  // fabricated 5.0★ / arbitrary review count with no Google data behind it.
  const placeId = typeof patch.placeId === "string" ? patch.placeId.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(placeId)) {
    throw new Error("A valid Google Place ID is required.");
  }
  const clean: GoogleLocationPatch = { placeId };
  if (patch.name !== undefined) clean.name = String(patch.name).trim().slice(0, 200);
  if (patch.address !== undefined) clean.address = String(patch.address).trim().slice(0, 300);
  if (patch.city !== undefined) clean.city = String(patch.city).trim().slice(0, 120);
  if (patch.category !== undefined) clean.category = String(patch.category).trim().slice(0, 120);
  if (patch.rating !== undefined) {
    const rating = Number(patch.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      throw new Error("Rating must be between 0 and 5.");
    }
    clean.rating = Math.round(rating * 10) / 10;
  }
  if (patch.reviewCount !== undefined) {
    const count = Number(patch.reviewCount);
    if (!Number.isInteger(count) || count < 0 || count > 10_000_000) {
      throw new Error("Review count is out of range.");
    }
    clean.reviewCount = count;
  }
  await provider.updateLocationGoogle(ws, clean);
  revalidatePath("/", "layout");
}

// ── Email sender (Settings → Channels) ──────────────────────

/**
 * Owners connect outbound email themselves — either a Resend API key or any
 * SMTP mailbox they already own. Nothing here trusts the form blindly: the
 * addresses are validated, the SMTP port is range-checked, and "verified" is
 * only ever stamped by `sendTestEmailAction` actually delivering a message.
 */
export interface EmailSettingsFormInput {
  provider: EmailProvider;
  /** Blank keeps the stored secret — the UI never receives it to send back. */
  secret?: string;
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpSecure?: boolean;
}

export async function getEmailSettingsAction(): Promise<EmailSettingsView> {
  const { ws } = await scoped("owner", "manager");
  return readEmailSettings(ws);
}

export async function saveEmailSettingsAction(
  input: EmailSettingsFormInput,
): Promise<{ ok: boolean; message: string }> {
  const { ws } = await scoped("owner");

  const provider: EmailProvider = input.provider === "smtp" ? "smtp" : "resend";
  const fromEmail = String(input.fromEmail ?? "").trim();
  if (!EMAIL_RE.test(fromEmail)) {
    return { ok: false, message: "Enter the address your review requests should come from." };
  }
  const replyTo = String(input.replyTo ?? "").trim();
  if (replyTo && !EMAIL_RE.test(replyTo)) {
    return { ok: false, message: "The reply-to address isn't a valid email address." };
  }

  const patch: EmailSettingsFormInput = {
    provider,
    secret: typeof input.secret === "string" ? input.secret.trim() : undefined,
    fromEmail,
    fromName: String(input.fromName ?? "").trim().slice(0, 120) || undefined,
    replyTo: replyTo || undefined,
  };

  if (provider === "smtp") {
    const host = String(input.smtpHost ?? "").trim();
    const user = String(input.smtpUser ?? "").trim();
    const port = Number(input.smtpPort ?? 587);
    if (!host) return { ok: false, message: "Enter your SMTP server address, e.g. smtp.gmail.com." };
    if (!user) return { ok: false, message: "Enter the SMTP username (usually the full mailbox address)." };
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      return { ok: false, message: "SMTP port must be a number between 1 and 65535." };
    }
    patch.smtpHost = host.slice(0, 253);
    patch.smtpUser = user.slice(0, 320);
    patch.smtpPort = port;
    // Port 465 is implicit TLS; everything else negotiates STARTTLS.
    patch.smtpSecure = input.smtpSecure ?? port === 465;
  }

  const saved = await saveEmailSettings(ws, patch);
  if (!saved.ok) return { ok: false, message: saved.reason };

  revalidatePath("/app/settings", "layout");
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: "Saved. Send a test email to confirm it delivers.",
  };
}

export async function sendTestEmailAction(
  to?: string,
): Promise<{ ok: boolean; message: string }> {
  const { ws, session } = await scoped("owner");

  const recipient = String(to ?? session.email ?? "").trim();
  if (!EMAIL_RE.test(recipient)) {
    return { ok: false, message: "Enter a valid address to send the test to." };
  }
  const limit = consumeRateLimit("email-test-send", ws, 10, 60 * 60_000);
  if (!limit.allowed) {
    return { ok: false, message: "Too many test emails. Try again in an hour." };
  }

  const template = emailTestEmail();
  const result = await sendEmail({
    to: recipient,
    subject: template.subject,
    html: template.html,
    text: template.text,
    workspaceId: ws,
  });

  await recordEmailTestResult(ws, {
    ok: result.ok,
    detail: result.ok ? undefined : (result.detail ?? result.reason),
  });
  revalidatePath("/app/settings", "layout");
  revalidatePath("/", "layout");

  if (result.ok) {
    return { ok: true, message: `Test email sent to ${recipient}. Check the inbox (and spam).` };
  }
  return {
    ok: false,
    message:
      result.reason === "not_configured"
        ? "No email sender is connected yet. Save your settings first."
        : `Delivery failed: ${result.detail ?? "the mail server rejected the message"}`,
  };
}

export async function disconnectEmailAction(): Promise<{ ok: true }> {
  const { ws } = await scoped("owner");
  await deleteEmailSettings(ws);
  revalidatePath("/app/settings", "layout");
  revalidatePath("/", "layout");
  return { ok: true };
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

  // Evaluate milestones against the numbers this sync just measured, so an
  // owner who syncs manually sees the win now rather than after the daily cron.
  const synced = await provider.getData(ws);
  if (synced) {
    await awardMilestones({ provider, workspaceId: ws, data: synced, now: new Date() });
    revalidatePath("/app/milestones");
  }

  revalidatePath("/app");
  revalidatePath("/app/reviews");
  revalidatePath("/app/settings/integrations");
  revalidatePath("/app/settings/business");

  if (!pub.ok) {
    return { ok: false, message: pub.error ?? "Couldn't reach Google — please try again." };
  }

  const stars = typeof pub.rating === "number" ? pub.rating.toFixed(1) : "—";
  const base = `Synced your public Google data: ${stars}★ from ${pub.reviewCount ?? 0} reviews.`;
  // The public sync now audits the listing too, so report the score and the
  // number of things to fix even when Business Profile is not connected.
  const publicAudit =
    typeof pub.capabilityScore === "number"
      ? ` Profile score ${pub.capabilityScore}% from public Google data, with ${pub.suggestionsCreated ?? 0} thing${pub.suggestionsCreated === 1 ? "" : "s"} to work on.`
      : "";

  if (profile.ok && profile.pendingApproval) {
    return {
      ok: true,
      pendingApproval: true,
      rating: pub.rating,
      reviewCount: pub.reviewCount,
      capabilityScore: pub.capabilityScore,
      auditFindings: pub.auditFindings,
      suggestionsCreated: pub.suggestionsCreated,
      message: `${base}${publicAudit} Your full review history and performance import automatically once Google approves your Business Profile connection (typically 1–2 weeks).`,
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
    capabilityScore: pub.capabilityScore,
    auditFindings: pub.auditFindings,
    suggestionsCreated: pub.suggestionsCreated,
    message: `${base}${publicAudit} Connect your Google Business Profile to import your full review history and performance.`,
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

export type BusinessDetailsActionResult = { ok: boolean; message: string };

/**
 * Save the business facts an owner can supply without a Google connection.
 *
 * Google stays authoritative: when a Business Profile sync has provided a
 * website or description, that value still wins on screen. This is the fallback
 * that lets an unconnected workspace supply the website that content CTAs and
 * website evidence collection both depend on.
 */
export async function updateBusinessDetailsAction(
  formData: FormData,
): Promise<BusinessDetailsActionResult> {
  const { provider, ws, session } = await scoped("owner", "manager");
  const rawWebsite = String(formData.get("website") ?? "").trim();
  const rawDescription = String(formData.get("ownerDescription") ?? "").trim();

  let website = "";
  if (rawWebsite) {
    const candidate = /^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`;
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return { ok: false, message: "That website address is not a valid URL." };
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, message: "The website must be an http or https address." };
    }
    if (!parsed.hostname.includes(".")) {
      return { ok: false, message: "Enter a full domain, for example example.com." };
    }
    website = parsed.toString();
  }
  if (rawDescription.length > 750) {
    return { ok: false, message: "Keep the description to 750 characters or fewer." };
  }

  await provider.updateBusinessDetails(ws, { website, ownerDescription: rawDescription });
  await provider.appendAuditLog(ws, {
    id: `audit_${randomBytes(12).toString("hex")}`,
    workspaceId: ws,
    actor: session.name,
    action: "business.details_updated",
    targetType: "location",
    targetId: ws,
    at: new Date().toISOString(),
    meta: { websiteSet: Boolean(website), descriptionSet: Boolean(rawDescription) },
  });
  revalidatePath("/app/settings/business");
  revalidatePath("/app/studio");
  return { ok: true, message: "Business details saved." };
}

export type ManualDraftActionResult =
  | { ok: true; message: string; suggestionId: string }
  | { ok: false; message: string };

/**
 * Start a content draft the owner asked for directly, rather than one the audit
 * proposed. Grounding is limited to facts Foundly has actually confirmed from
 * Google Places (business name, category, city) — no Business Profile sync is
 * required, so the Studio stays usable before API access is granted.
 *
 * The draft enters the same inbox at "needs_generation" and then runs through
 * the unchanged generation path, so it inherits the identical lint pass, exact
 * preview and approval gate. Nothing here writes to Google.
 */
export async function createManualContentDraftAction(
  kind: string,
): Promise<ManualDraftActionResult> {
  const { provider, ws, session } = await scoped("owner", "manager");
  if (!isManualContentKind(kind)) {
    return { ok: false, message: "That content type cannot be started manually." };
  }
  const limited = consumeRateLimit("ai-manual-draft", session.userId, 8, 60 * 60_000);
  if (!limited.allowed) {
    return { ok: false, message: `Draft creation is rate-limited. Try again in ${limited.retryAfter} seconds.` };
  }
  const data = await provider.getData(ws);
  if (!data) return { ok: false, message: "The workspace could not be loaded." };
  if (!data.location.name.trim() || !data.location.category.trim()) {
    return {
      ok: false,
      message: "Add your business name and category in Settings → Business before generating content.",
    };
  }

  const now = new Date().toISOString();
  const manualKind: ManualContentKind = kind;
  const label = manualContentKindLabel(manualKind);
  const suggestion: ProfileSuggestion = {
    id: `sug_manual_${randomBytes(9).toString("hex")}`,
    workspaceId: ws,
    locationId: data.location.id,
    auditId: "manual",
    findingId: "manual",
    target: manualKind === "local_post" ? "local_post" : "description",
    kind: manualKind === "local_post" ? "local_post" : "profile_edit",
    title: `${label} requested by ${session.name}`,
    rationale:
      "You started this draft yourself. It is grounded only in the business facts Foundly has confirmed from Google Places — connect Business Profile to ground future drafts in your full audit evidence.",
    priorityScore: 50,
    risk: manualKind === "local_post" ? "low" : "medium",
    status: "needs_generation",
    exactPreviewReady: false,
    evidenceIds: ["profile.business_name", "profile.primary_category", "profile.city"],
    blockers: [],
    nextStep: "Generate exact draft",
    createdAt: now,
    updatedAt: now,
  };

  await provider.appendProfileSuggestion(ws, suggestion);
  await provider.appendAuditLog(ws, {
    id: `audit_${randomBytes(12).toString("hex")}`,
    workspaceId: ws,
    actor: session.name,
    action: "content.manual_draft_started",
    targetType: "profile_suggestion",
    targetId: suggestion.id,
    at: now,
    meta: { kind: manualKind },
  });

  const generated = await generateContentSuggestionPreviewAction(suggestion.id);
  revalidatePath("/app/studio");
  revalidatePath("/app/this-week");
  if (!generated.ok) return { ok: false, message: generated.message };
  return { ok: true, message: generated.message, suggestionId: suggestion.id };
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
    ...(data.location.website
      ? [{ id: "profile.website", field: "website", value: data.location.website, source: "owner" }]
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
      existingDescription:
        snapshot?.location.profile?.description
        || data.location.profile.description
        || data.location.ownerDescription,
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
    const allowedUrl = sameAllowedUrl(generated.content.callToAction.url, [
      snapshot?.location.websiteUri,
      data.location.website,
    ]);
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
 * What the shared content-publication runner observed. Callers map this to
 * their own surface copy; none of them re-implement the ledger or the
 * read-after-write handling.
 */
type ContentPublicationRun =
  | { kind: "already_published"; job: ContentPublishingJob }
  | { kind: "previous_failure"; job: ContentPublishingJob; error?: string }
  | { kind: "in_flight"; job: ContentPublishingJob }
  | { kind: "executed"; job: ContentPublishingJob; ok: boolean; verified: boolean; error?: string };

/**
 * THE Google content-publication sequence — one implementation, shared by the
 * governed suggestion approval and the reviews-inbox reply drawer:
 *
 *  1. write the idempotency ledger row BEFORE Google is called (a repeat of the
 *     exact same payload short-circuits instead of double-posting),
 *  2. audit-log the approval,
 *  3. execute the prepared plan, which read-after-write verifies the value,
 *  4. persist `published` / `verification_pending` / `failed` / `rejected` and
 *     audit-log the result — never swallowing an error.
 */
async function runContentPublication(args: {
  provider: DataProvider;
  ws: string;
  locationId: string;
  actor: string;
  /** Ledger reference: a suggestion id for the inbox path, a review id for a reply. */
  publicationRef: string;
  plan: PreparedContentPublication;
  idempotencyKey: string;
  approvedAt: string;
  approvalAudit: {
    action: string;
    targetType: string;
    targetId: string;
    meta: Record<string, string | number | boolean>;
  };
  resultMeta: Record<string, string | number | boolean>;
  /** Mirrors the job state onto a suggestion row, when the surface has one. */
  onStatus?: (status: ProfileSuggestionStatus, at: string) => Promise<void>;
}): Promise<ContentPublicationRun> {
  const { provider, ws, plan } = args;
  const now = new Date().toISOString();
  const proposedJob: ContentPublishingJob = {
    id: `pub_${randomBytes(12).toString("hex")}`,
    workspaceId: ws,
    locationId: args.locationId,
    suggestionId: args.publicationRef,
    assetId: plan.assetId,
    idempotencyKey: args.idempotencyKey,
    kind: plan.kind,
    status: "queued",
    exactPayload: plan.body,
    attempts: 0,
    approvedAt: args.approvedAt,
    approvedBy: args.actor,
    createdAt: now,
    updatedAt: now,
  };
  const created = await provider.createContentPublishingJob(ws, proposedJob);
  if (!created.created) {
    if (created.job.status === "published") return { kind: "already_published", job: created.job };
    if (created.job.status === "failed" || created.job.status === "rejected") {
      return { kind: "previous_failure", job: created.job, error: created.job.lastError };
    }
    return { kind: "in_flight", job: created.job };
  }

  await args.onStatus?.("queued", now);
  await provider.appendAuditLog(ws, {
    id: `audit_${randomBytes(12).toString("hex")}`,
    workspaceId: ws,
    actor: args.actor,
    action: args.approvalAudit.action,
    targetType: args.approvalAudit.targetType,
    targetId: args.approvalAudit.targetId,
    at: now,
    meta: { publishingJobId: created.job.id, ...args.approvalAudit.meta },
  });

  const startedAt = new Date().toISOString();
  await provider.updateContentPublishingJob(ws, created.job.id, {
    status: "executing",
    attempts: 1,
    startedAt,
    updatedAt: startedAt,
  });
  await args.onStatus?.("executing", startedAt);

  let execution;
  try {
    execution = await executeContentPublication(plan, await provider.getGoogleCredential(ws));
  } catch (error) {
    execution = {
      ok: false,
      verified: false,
      error: error instanceof Error ? error.message : "Google publication failed.",
    };
  }
  const finishedAt = new Date().toISOString();
  if (!execution.ok) {
    const rejected = "rejected" in execution && Boolean(execution.rejected);
    const message = execution.error ?? "Google rejected this publication.";
    await provider.updateContentPublishingJob(ws, created.job.id, {
      status: rejected ? "rejected" : "failed",
      providerResponse: "providerResponse" in execution ? execution.providerResponse : undefined,
      providerResourceName: "providerResourceName" in execution ? execution.providerResourceName : undefined,
      verifiedValue: "verifiedValue" in execution ? execution.verifiedValue : undefined,
      failedAt: finishedAt,
      lastError: message,
      updatedAt: finishedAt,
    });
    await args.onStatus?.("failed", finishedAt);
    await provider.appendAuditLog(ws, {
      id: `audit_${randomBytes(12).toString("hex")}`,
      workspaceId: ws,
      actor: "Foundly",
      action: rejected ? "content.publication_rejected" : "content.publication_failed",
      targetType: "content_publishing_job",
      targetId: created.job.id,
      at: finishedAt,
      meta: { ...args.resultMeta, error: message.slice(0, 180) },
    });
    return { kind: "executed", job: created.job, ok: false, verified: false, error: message };
  }

  await provider.updateContentPublishingJob(ws, created.job.id, {
    status: execution.verified ? "published" : "verification_pending",
    providerResponse: "providerResponse" in execution ? execution.providerResponse : undefined,
    providerResourceName: "providerResourceName" in execution ? execution.providerResourceName : undefined,
    verifiedValue: "verifiedValue" in execution ? execution.verifiedValue : undefined,
    ...(execution.verified ? { publishedAt: finishedAt } : {}),
    ...(execution.error ? { lastError: execution.error } : {}),
    updatedAt: finishedAt,
  });
  await args.onStatus?.(execution.verified ? "applied" : "verification_pending", finishedAt);
  const providerResourceName = "providerResourceName" in execution ? execution.providerResourceName : undefined;
  await provider.appendAuditLog(ws, {
    id: `audit_${randomBytes(12).toString("hex")}`,
    workspaceId: ws,
    actor: "Foundly",
    action: execution.verified ? "content.publication_verified" : "content.publication_verification_pending",
    targetType: "content_publishing_job",
    targetId: created.job.id,
    at: finishedAt,
    meta: {
      ...args.resultMeta,
      ...(providerResourceName ? { providerResourceName } : {}),
    },
  });
  return {
    kind: "executed",
    job: created.job,
    ok: true,
    verified: execution.verified,
    ...(execution.error ? { error: execution.error } : {}),
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
  const run = await runContentPublication({
    provider,
    ws,
    locationId: data.location.id,
    actor: session.name,
    publicationRef: suggestionId,
    plan,
    idempotencyKey,
    approvedAt,
    approvalAudit: {
      action: "content.publication_approved",
      targetType: "profile_suggestion",
      targetId: suggestionId,
      meta: { kind: existing.kind, exactPreviewGeneratedAt: approvedAt },
    },
    resultMeta: { kind: existing.kind },
    onStatus: async (status, at) => {
      await provider.updateProfileSuggestion(ws, suggestionId, {
        status,
        ...(status === "queued" ? { approvedAt, approvedBy: session.name } : {}),
        updatedAt: at,
      });
    },
  });

  if (run.kind === "already_published") {
    await provider.updateProfileSuggestion(ws, suggestionId, {
      status: "applied",
      updatedAt: new Date().toISOString(),
    });
    return { ok: true, status: "applied", message: "This exact content was already published and verified." };
  }
  if (run.kind === "previous_failure") {
    return {
      ok: false,
      status: "failed",
      message: run.error ?? "The previous publication failed. Regenerate or review it before retrying.",
    };
  }
  if (run.kind === "in_flight") {
    return {
      ok: true,
      status: run.job.status === "verification_pending" ? "verification_pending" : run.job.status === "executing" ? "executing" : "queued",
      message: "This exact content is already queued; it was not submitted twice.",
    };
  }
  if (!run.ok) {
    revalidatePath("/app/this-week");
    return { ok: false, status: "failed", message: run.error ?? "Google rejected this publication." };
  }

  revalidatePath("/app");
  revalidatePath("/app/studio");
  revalidatePath("/app/this-week");
  revalidatePath("/app/reviews");
  return {
    ok: true,
    status: run.verified ? "applied" : "verification_pending",
    message: run.verified
      ? "Google published the exact approved content and Foundly verified it."
      : run.error ?? "Google accepted the exact content; Foundly is waiting for verification.",
  };
}

export type RankGridActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Deterministic stand-in businesses so the demo workspace shows a populated
 * "who is taking the calls here" list without spending a Places call. Names are
 * obviously generic on purpose — nothing is passed off as a real competitor.
 */
const DEMO_COMPETITOR_PREFIXES = [
  "Northside",
  "Riverbend",
  "Oakview",
  "Summit",
  "Bright Path",
  "Cedar Lane",
  "Harbourfront",
  "Maple Grove",
  "Lakeshore",
  "Stonebridge",
  "Parkway",
  "Everley",
] as const;

function demoRankGridResults(input: {
  seed: number;
  rank: number | null;
  ownPlaceId: string;
  ownName: string;
  ownRating: number;
  ownReviewCount: number;
  category: string;
  city: string;
}): RankGridResult[] {
  const depth = 10;
  const entries: RankGridResult[] = [];
  for (let slot = 0; slot < depth; slot += 1) {
    const prefix =
      DEMO_COMPETITOR_PREFIXES[(input.seed * 5 + slot) % DEMO_COMPETITOR_PREFIXES.length] ??
      "Northside";
    entries.push({
      placeId: `demo_place_${prefix.toLowerCase().replace(/\s+/g, "_")}`,
      name: `${prefix} ${input.category}`,
      position: slot + 1,
      address: input.city,
      rating: Math.round((4.9 - ((input.seed + slot) % 9) * 0.1) * 10) / 10,
      reviewCount: 40 + ((input.seed * 13 + slot * 29) % 460),
    });
  }
  if (input.rank !== null && input.rank <= depth) {
    entries.splice(input.rank - 1, 0, {
      placeId: input.ownPlaceId,
      name: input.ownName,
      position: input.rank,
      address: input.city,
      rating: input.ownRating,
      reviewCount: input.ownReviewCount,
    });
    entries.length = depth;
  }
  return entries.map((entry, index) => ({ ...entry, position: index + 1 }));
}

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
  if (!subscriptionHasFeature(data.subscription, "rank_grid")) {
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
  let center: RankGridScan["center"];
  let failedPoints = 0;
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
    center = sample?.center;
    points = points.map((point, index) => ({
      ...point,
      results: demoRankGridResults({
        seed: index,
        rank: point.rank,
        ownPlaceId: data.location.googlePlaceId ?? data.location.id,
        ownName: data.location.name,
        ownRating: data.location.rating,
        ownReviewCount: data.location.reviewCount,
        category: data.location.category,
        city: data.location.city,
      }),
    }));
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
    failedPoints = result.failedPoints;
    center = {
      latitude: details.details.location.latitude,
      longitude: details.details.location.longitude,
    };
  }

  // Points Google could not be reached for are excluded from both averages.
  // Counting them as "rank 21, not in the pack" would quietly report a ranking
  // loss the scan never actually observed.
  const measured = points.filter((point) => !point.unavailable);
  const measuredCount = Math.max(1, measured.length);
  const rankingValues = measured.map((point) => point.rank ?? 21);
  const scan: RankGridScan = {
    id: `rank_${randomBytes(10).toString("hex")}`,
    locationId: data.location.id,
    keyword,
    gridSize,
    radiusKm,
    source: "google_places",
    points,
    ...(center ? { center } : {}),
    avgRank: rankingValues.reduce((sum, rank) => sum + rank, 0) / measuredCount,
    shareOfLocalPack:
      measured.filter((point) => point.rank !== null && point.rank <= 3).length / measuredCount,
    ranAt: new Date().toISOString(),
  };
  await provider.saveRankGridScan(ws, scan);
  revalidatePath("/app/rank-grid");
  // The dashboard's "Visibility in your area" card reads the same latest scan.
  // Without this it kept rendering the cached "No scan yet" empty state after a
  // successful scan — the runner's router.refresh() only revalidates the route
  // it was called from.
  revalidatePath("/app");
  return {
    ok: true,
    message: session.isDemo
      ? "Demo scan refreshed with sample results."
      : failedPoints > 0
        ? `Completed ${points.length - failedPoints} of ${points.length} Google Places checks for “${keyword}”. ${failedPoints} point${failedPoints === 1 ? "" : "s"} returned no data.`
        : `Completed ${points.length} Google Places checks for “${keyword}”.`,
  };
}

export async function updateWhiteLabelAction(config: WhiteLabelConfig) {
  const { provider, ws, session } = await agencyScoped("owner", "agency_admin");
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
  const { provider, ws, session } = await agencyScoped("owner", "agency_admin");
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
  if (!(await emailEnabledFor(ws))) {
    return {
      ok: false,
      sent: 0,
      skipped: targets.filter((client) => !client.contactEmail).length,
      failed: 0,
      message: "Connect an email sender in Settings → Channels before sending client reports.",
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
      workspaceId: ws,
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
  if (await emailEnabledFor(ws)) {
    try {
      const data = await provider.getData(ws);
      if (data) {
        const base = await appUrl();
        const { subject, html } = staffInviteEmail({
          business: data.location.name,
          link: `${base}/sign-up?invite=${result.token}`,
        });
        const res = await sendEmail({
          to: result.email,
          subject,
          html,
          workspaceId: ws,
        });
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

/**
 * Mark one notification read — used when the owner follows it through to the
 * record it describes, so opening a single item does not clear the rest.
 */
export async function markNotificationReadAction(notificationId: string) {
  const id = notificationId.trim();
  if (!id) return;
  const { provider, ws } = await scoped("owner", "manager", "staff");
  await provider.markNotificationRead(ws, id);
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

/**
 * Enter one of the agency's client workspaces as its owner.
 *
 * The target must be a sibling workspace in the agency's organization — the
 * same proof `switchWorkspaceAction` demands — and is looked up by location id
 * because that is what the client book carries. The session keeps the
 * agency_admin role and records where to return (`homeWorkspaceId`), which
 * is what lets the middleware admit this session to /app at all.
 */
export async function enterClientWorkspaceAction(
  locationId: string,
): Promise<{ ok: false; error: string }> {
  const { provider, session, ws: home } = await agencyScoped("agency_admin", "owner");
  const data = await provider.getData(home);
  if (!data || (session.role !== "agency_admin" && data.subscription.tier !== "agency")) {
    return { ok: false, error: "Client workspaces require the Agency plan." };
  }
  const wanted = String(locationId ?? "").trim();
  const siblings = await provider.listOrganizationWorkspaces(home);
  const target = siblings.find((workspace) => workspace.locationId === wanted);
  if (!target || target.workspaceId === home) {
    return { ok: false, error: "That client is not part of this agency." };
  }
  await createSession({ ...session, workspaceId: target.workspaceId, homeWorkspaceId: home });
  redirect("/app");
}

/**
 * Open a tenant's workspace from the ops console, as Foundly support.
 *
 * Full owner access, not read-only — support needs to press the same buttons
 * the owner would. Every session is written to the TENANT's audit log before
 * it starts (operator, workspace, time), so the owner can see it happened.
 */
export async function openTenantWorkspaceAction(
  workspaceId: string,
): Promise<{ ok: false; error: string }> {
  const { provider, session, ws: home } = await agencyScoped("platform_admin");
  const target = String(workspaceId ?? "").trim();
  if (!target || target === home) return { ok: false, error: "Pick a tenant workspace to open." };
  const data = await provider.getData(target);
  if (!data) return { ok: false, error: "That workspace no longer exists." };
  if (data.workspace.isDemo) return { ok: false, error: "The demo workspace is not a tenant." };
  await provider.appendAuditLog(target, {
    id: `aud_${randomBytes(8).toString("hex")}`,
    workspaceId: target,
    actor: session.email || "Foundly support",
    action: "support.session_opened",
    targetType: "workspace",
    targetId: target,
    at: new Date().toISOString(),
    meta: { operator: session.email, role: "platform_admin", access: "full" },
  });
  await createSession({ ...session, workspaceId: target, homeWorkspaceId: home });
  redirect("/app");
}

/** Leave the client (or tenant) workspace and go back to your own console. */
export async function returnHomeAction(): Promise<void> {
  const session = await requireSession();
  const console = session.role === "platform_admin" ? "/admin" : "/agency";
  if ((session.role === "agency_admin" || session.role === "platform_admin") && session.homeWorkspaceId) {
    const { homeWorkspaceId, ...rest } = session;
    await createSession({ ...rest, workspaceId: homeWorkspaceId });
  }
  redirect(console);
}

/** @deprecated name kept for the agency banner; same as `returnHomeAction`. */
export async function returnToAgencyAction(): Promise<void> {
  return returnHomeAction();
}

export interface CreateAgencyClientResult {
  ok: true;
  /** The Google listing the new client was matched to, when one was found. */
  google: { name: string; city: string; rating: number; reviewCount: number } | null;
}

export async function createAgencyClientAction(input: {
  businessName: string;
  contactEmail: string;
  industryKey: string;
  category: string;
  region: Region;
  city?: string;
  address?: string;
}): Promise<CreateAgencyClientResult | { ok: false; error: string }> {
  const { provider, ws, session } = await agencyScoped("owner", "agency_admin");
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

  // Match the new client to its real Google listing so the book shows its
  // actual rating and review count from the first render, the way
  // `db:provision` does for a new tenant. Guarded by the same name check as
  // /score: Places always returns a confident best effort, and a client called
  // "Tune Epicenter" once came back as a music class in another country. A
  // failed or implausible match leaves the client unlinked rather than wrong.
  let google: CreateAgencyClientResult["google"] = null;
  if (!session.isDemo) {
    try {
      const city = input.city?.trim();
      const found = await searchBusinesses(city ? `${businessName} ${city}` : businessName, input.region);
      const place = found.ok
        ? found.places.find((candidate) => isPlausibleNameMatch(businessName, candidate.name))
        : undefined;
      if (place) {
        const childWs = result.workspace.workspaceId;
        await provider.updateLocationGoogle(childWs, {
          placeId: place.placeId,
          name: place.name,
          address: place.address,
          city: place.city,
          category: place.category,
          rating: place.rating,
          reviewCount: place.reviewCount,
        });
        await provider.syncGooglePublic(childWs).catch(() => undefined);
        google = { name: place.name, city: place.city, rating: place.rating, reviewCount: place.reviewCount };
      }
    } catch {
      google = null;
    }
  }
  revalidatePath("/agency", "layout");
  return { ok: true, google };
}

// ── Agency: managing one client ─────────────────────────────
/**
 * Every client action starts here: the caller must be the agency (or an
 * owner on the Agency plan), `ws` is always the AGENCY's workspace, and the
 * agency's data is loaded once for the checks below.
 */
async function agencyContext() {
  const { provider, ws, session } = await agencyScoped("owner", "agency_admin");
  const data = await provider.getData(ws);
  if (!data || (session.role !== "agency_admin" && data.subscription.tier !== "agency")) return null;
  return { provider, ws, session, data };
}

/**
 * Resolve a book entry to the client's workspace, with the same proof
 * `switchWorkspaceAction` demands: it must be a sibling in the agency's
 * organization and never the agency's own workspace.
 */
async function agencyClientTarget(provider: DataProvider, ws: string, locationId: string) {
  const wanted = String(locationId ?? "").trim();
  if (!wanted) return null;
  const siblings = await provider.listOrganizationWorkspaces(ws);
  return siblings.find((workspace) => workspace.locationId === wanted && workspace.workspaceId !== ws) ?? null;
}

async function agencyAudit(
  provider: DataProvider,
  ws: string,
  session: Session,
  action: string,
  targetType: string,
  targetId: string,
  meta?: Record<string, string | number | boolean>,
) {
  await provider.appendAuditLog(ws, {
    id: `aud_${randomBytes(8).toString("hex")}`,
    workspaceId: ws,
    actor: session.email || session.name || "Agency",
    action,
    targetType,
    targetId,
    at: new Date().toISOString(),
    meta,
  });
}

type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateAgencyRatesAction(input: {
  wholesaleRate: number;
  retailAverage: number;
}): Promise<ActionResult> {
  const ctx = await agencyContext();
  if (!ctx) return { ok: false, error: "Client management requires the Agency plan." };
  const wholesaleRate = Number(input.wholesaleRate);
  const retailAverage = Number(input.retailAverage);
  for (const value of [wholesaleRate, retailAverage]) {
    if (!Number.isFinite(value) || value < 0 || value > 100_000) {
      return { ok: false, error: "Rates must be between 0 and 100,000 per location per month." };
    }
  }
  await ctx.provider.setAgencyRates(ctx.ws, {
    wholesaleRate: Math.round(wholesaleRate * 100) / 100,
    retailAverage: Math.round(retailAverage * 100) / 100,
  });
  await agencyAudit(ctx.provider, ctx.ws, ctx.session, "agency.rates_updated", "agency", ctx.data.agency.id, {
    wholesaleRate,
    retailAverage,
  });
  revalidatePath("/agency", "layout");
  return { ok: true };
}

export async function updateAgencyClientContactAction(
  locationId: string,
  contactEmail: string,
): Promise<ActionResult> {
  const ctx = await agencyContext();
  if (!ctx) return { ok: false, error: "Client management requires the Agency plan." };
  const email = String(contactEmail ?? "").trim().toLowerCase().slice(0, 254);
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid contact email." };
  const updated = await ctx.provider.updateAgencyClient(ctx.ws, String(locationId ?? "").trim(), { contactEmail: email });
  if (!updated) return { ok: false, error: "That client is not in your book." };
  await agencyAudit(ctx.provider, ctx.ws, ctx.session, "agency.client_contact_updated", "client", updated.locationId, {
    contactEmail: email,
  });
  revalidatePath("/agency", "layout");
  return { ok: true };
}

export interface AgencyGooglePlace {
  placeId: string;
  name: string;
  address: string;
  city: string;
  rating: number;
  reviewCount: number;
  category: string;
}

/** Search Google for a client's listing — candidates only, nothing is written. */
export async function searchAgencyClientGoogleAction(
  locationId: string,
  query: string,
): Promise<{ ok: true; places: AgencyGooglePlace[] } | { ok: false; error: string }> {
  const ctx = await agencyContext();
  if (!ctx) return { ok: false, error: "Client management requires the Agency plan." };
  if (ctx.session.isDemo) return { ok: false, error: "The demo uses sample data — sign up to search Google." };
  const target = await agencyClientTarget(ctx.provider, ctx.ws, locationId);
  if (!target) return { ok: false, error: "That client is not part of this agency." };
  const q = String(query ?? "").trim().slice(0, 160);
  if (q.length < 2) return { ok: false, error: "Type the business name (and city) to search." };
  const child = await ctx.provider.getData(target.workspaceId);
  const found = await searchBusinesses(q, child?.workspace.region ?? "US");
  if (!found.ok) return { ok: false, error: found.detail || "Google search failed. Try again." };
  return {
    ok: true,
    places: found.places.slice(0, 6).map((place) => ({
      placeId: place.placeId,
      name: place.name,
      address: place.address,
      city: place.city,
      rating: place.rating,
      reviewCount: place.reviewCount,
      category: place.category,
    })),
  };
}

/** Link a client's workspace to the chosen Google listing and pull its public data. */
export async function linkAgencyClientGoogleAction(
  locationId: string,
  place: AgencyGooglePlace,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const ctx = await agencyContext();
  if (!ctx) return { ok: false, error: "Client management requires the Agency plan." };
  if (ctx.session.isDemo) return { ok: false, error: "The demo uses sample data — sign up to link a listing." };
  const target = await agencyClientTarget(ctx.provider, ctx.ws, locationId);
  if (!target) return { ok: false, error: "That client is not part of this agency." };
  const placeId = typeof place?.placeId === "string" ? place.placeId.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(placeId)) return { ok: false, error: "Pick a Google listing to link." };
  const rating = Number(place.rating);
  const reviewCount = Number(place.reviewCount);
  await ctx.provider.updateLocationGoogle(target.workspaceId, {
    placeId,
    name: String(place.name ?? "").trim().slice(0, 200) || undefined,
    address: String(place.address ?? "").trim().slice(0, 300) || undefined,
    city: String(place.city ?? "").trim().slice(0, 120) || undefined,
    category: String(place.category ?? "").trim().slice(0, 120) || undefined,
    rating: Number.isFinite(rating) && rating >= 0 && rating <= 5 ? Math.round(rating * 10) / 10 : undefined,
    reviewCount: Number.isInteger(reviewCount) && reviewCount >= 0 ? reviewCount : undefined,
  });
  const sync = await ctx.provider.syncGooglePublic(target.workspaceId).catch(() => null);
  await agencyAudit(ctx.provider, ctx.ws, ctx.session, "agency.client_google_linked", "client", target.locationId, {
    placeId,
    name: String(place.name ?? ""),
  });
  revalidatePath("/agency", "layout");
  const stars = sync?.ok && typeof sync.rating === "number" ? `${sync.rating.toFixed(1)}★ from ${sync.reviewCount ?? 0} reviews` : null;
  return {
    ok: true,
    message: stars
      ? `Linked to ${place.name} and synced its public Google data: ${stars}.`
      : `Linked to ${place.name}. Google's public data will appear after the next sync.`,
  };
}

/** Pull the client's Google data now — public listing, and the profile when connected. */
export async function syncAgencyClientAction(
  locationId: string,
): Promise<{ ok: boolean; message: string }> {
  const ctx = await agencyContext();
  if (!ctx) return { ok: false, message: "Client management requires the Agency plan." };
  if (ctx.session.isDemo) return { ok: false, message: "The demo uses sample data — sign up to sync real Google data." };
  const target = await agencyClientTarget(ctx.provider, ctx.ws, locationId);
  if (!target) return { ok: false, message: "That client is not part of this agency." };
  const pub = await ctx.provider.syncGooglePublic(target.workspaceId);
  const profile = await ctx.provider.syncGoogleProfile(target.workspaceId).catch(() => null);
  const synced = await ctx.provider.getData(target.workspaceId);
  if (synced) {
    await awardMilestones({ provider: ctx.provider, workspaceId: target.workspaceId, data: synced, now: new Date() }).catch(() => undefined);
  }
  revalidatePath("/agency", "layout");
  if (!pub.ok) return { ok: false, message: pub.error ?? "Couldn't reach Google — please try again." };
  const stars = typeof pub.rating === "number" ? pub.rating.toFixed(1) : "—";
  const profileNote = profile?.ok && !profile.pendingApproval
    ? ` Imported ${profile.reviewsImported ?? 0} reviews from the connected Business Profile.`
    : profile?.pendingApproval
      ? " The full Business Profile import is waiting on Google."
      : "";
  return { ok: true, message: `Synced ${target.name}: ${stars}★ from ${pub.reviewCount ?? 0} Google reviews.${profileNote}` };
}

/** How long a client-owner invite link stays valid. */
const CLIENT_INVITE_DAYS = 7;

/**
 * Give the client their own login. Their workspace already exists with an
 * owner account that has no credentials (the agency created it); this points
 * that account at the client's contact email and sends a one-time
 * password-setup link. When no email sender is configured the link is
 * returned so the agency can pass it on themselves.
 */
export async function inviteAgencyClientOwnerAction(
  locationId: string,
): Promise<{ ok: true; emailed: boolean; link?: string; message: string } | { ok: false; error: string }> {
  const ctx = await agencyContext();
  if (!ctx) return { ok: false, error: "Client management requires the Agency plan." };
  if (ctx.session.isDemo) return { ok: false, error: "The demo cannot send invitations — sign up to invite a client." };
  const target = await agencyClientTarget(ctx.provider, ctx.ws, locationId);
  if (!target) return { ok: false, error: "That client is not part of this agency." };
  const entry = ctx.data.agency.clients.find((client) => client.locationId === target.locationId);
  const contactEmail = entry?.contactEmail?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(contactEmail)) {
    return { ok: false, error: "Add the client's contact email first — the invitation goes there." };
  }
  const identity = await ctx.provider.setWorkspaceOwnerIdentity(target.workspaceId, {
    email: contactEmail,
    name: target.name,
  });
  if (!identity.ok) return identity;

  const token = randomBytes(32).toString("base64url");
  const createdAt = new Date();
  await ctx.provider.savePasswordResetToken({
    tokenHash: resetTokenHash(token),
    userId: identity.userId,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + CLIENT_INVITE_DAYS * 86_400_000).toISOString(),
  });
  const base = await appUrl();
  const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;
  const sentAt = createdAt.toISOString();

  let emailed = false;
  if (await emailEnabledFor(ctx.ws)) {
    const template = clientInviteEmail({
      business: target.name,
      agencyName: ctx.data.agency.whiteLabel.brandName,
      link,
      expiresInDays: CLIENT_INVITE_DAYS,
    });
    const delivered = await sendEmail({
      to: contactEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
      replyTo: ctx.data.organization.billingEmail,
      workspaceId: ctx.ws,
    });
    emailed = delivered.ok;
  }
  await ctx.provider.updateAgencyClient(ctx.ws, target.locationId, { invitedAt: sentAt });
  await agencyAudit(ctx.provider, ctx.ws, ctx.session, "agency.client_invited", "client", target.locationId, {
    contactEmail,
    emailed,
  });
  revalidatePath("/agency", "layout");
  return emailed
    ? { ok: true, emailed, message: `Invitation sent to ${contactEmail}. The link works for ${CLIENT_INVITE_DAYS} days.` }
    : {
        ok: true,
        emailed,
        link,
        message: `No email sender is connected, so the invitation was not emailed. Send ${contactEmail} this link yourself — it works for ${CLIENT_INVITE_DAYS} days.`,
      };
}

/**
 * Remove a client: their workspace and everything in it is deleted, and the
 * book entry goes with it. Irreversible, so the caller must type the
 * client's name. A book entry whose workspace is already gone is simply
 * dropped from the book.
 */
export async function removeAgencyClientAction(
  locationId: string,
  confirmName: string,
): Promise<ActionResult> {
  const ctx = await agencyContext();
  if (!ctx) return { ok: false, error: "Client management requires the Agency plan." };
  if (ctx.session.isDemo) return { ok: false, error: "The demo book cannot be changed." };
  const wanted = String(locationId ?? "").trim();
  const entry = ctx.data.agency.clients.find((client) => client.locationId === wanted);
  if (!entry) return { ok: false, error: "That client is not in your book." };
  const target = await agencyClientTarget(ctx.provider, ctx.ws, wanted);
  const expected = (target?.name ?? entry.name).trim().toLowerCase();
  if (String(confirmName ?? "").trim().toLowerCase() !== expected) {
    return { ok: false, error: `Type the client's name exactly — ${target?.name ?? entry.name} — to confirm.` };
  }
  let removedUsers: string[] = [];
  if (target) {
    const deleted = await ctx.provider.deleteWorkspace(target.workspaceId);
    if (!deleted.ok) return deleted;
    removedUsers = deleted.userIds;
  }
  await ctx.provider.removeAgencyClient(ctx.ws, wanted);
  await agencyAudit(ctx.provider, ctx.ws, ctx.session, "agency.client_removed", "client", wanted, {
    name: target?.name ?? entry.name,
    workspaceId: target?.workspaceId ?? "",
    usersRemoved: removedUsers.length,
  });
  revalidatePath("/agency", "layout");
  return { ok: true };
}

/**
 * The agency's OWN listing lives in its own workspace, which the agency
 * console never shows in full. Entering it uses the same acting mechanism as
 * a client: `homeWorkspaceId` is set (to the same workspace), which is what
 * admits an agency admin to /app, and the banner offers the way back.
 */
export async function enterOwnWorkspaceAction(): Promise<{ ok: false; error: string }> {
  const { session, ws: home } = await agencyScoped("agency_admin");
  if (session.isDemo) return { ok: false, error: "The demo agency has no workspace of its own to open." };
  await createSession({ ...session, workspaceId: home, homeWorkspaceId: home });
  redirect("/app");
}

// ── Platform ops: managing one tenant ───────────────────────
const TENANT_STATUSES: ReadonlySet<Subscription["status"]> = new Set([
  "trialing",
  "active",
  "past_due",
  "free",
  "canceled",
  "paused",
]);

async function opsContext() {
  const { provider, session, ws: home } = await agencyScoped("platform_admin");
  return { provider, session, home };
}

/** A tenant workspace an operator may act on: real, not the demo, not ours. */
async function opsTenantWorkspace(provider: DataProvider, workspaceId: string) {
  const target = String(workspaceId ?? "").trim();
  if (!target) return { ok: false as const, error: "Pick a tenant workspace." };
  const data = await provider.getData(target);
  if (!data) return { ok: false as const, error: "That workspace no longer exists." };
  if (data.workspace.isDemo) return { ok: false as const, error: "The demo workspace is not a tenant." };
  const users = await provider.listWorkspaceUsers(target);
  if (users.some((user) => user.role === "platform_admin")) {
    return { ok: false as const, error: "That workspace belongs to the ops team, not a tenant." };
  }
  return { ok: true as const, target, data, users };
}

/** Every support action is written to the TENANT's ledger, naming the operator. */
async function tenantAudit(
  provider: DataProvider,
  workspaceId: string,
  session: Session,
  action: string,
  targetType: string,
  targetId: string,
  meta?: Record<string, string | number | boolean>,
) {
  await provider.appendAuditLog(workspaceId, {
    id: `aud_${randomBytes(8).toString("hex")}`,
    workspaceId,
    actor: session.email || "Foundly support",
    action,
    targetType,
    targetId,
    at: new Date().toISOString(),
    meta: { ...(meta ?? {}), operator: session.email, role: "platform_admin" },
  });
}

export async function setTenantSubscriptionAction(
  workspaceId: string,
  patch: { tier?: PlanTier; status?: Subscription["status"]; interval?: "monthly" | "annual" },
): Promise<ActionResult> {
  const { provider, session } = await opsContext();
  if (session.isDemo) return { ok: false, error: "Demo sessions cannot change a tenant." };
  const tenant = await opsTenantWorkspace(provider, workspaceId);
  if (!tenant.ok) return tenant;
  const clean: Parameters<DataProvider["setSubscription"]>[1] = {};
  if (patch.tier !== undefined) {
    if (!PLAN_ORDER.includes(patch.tier)) return { ok: false, error: "That plan does not exist." };
    clean.tier = patch.tier;
  }
  if (patch.status !== undefined) {
    if (!TENANT_STATUSES.has(patch.status)) return { ok: false, error: "That status does not exist." };
    clean.status = patch.status;
  }
  if (patch.interval !== undefined) {
    if (patch.interval !== "monthly" && patch.interval !== "annual") return { ok: false, error: "Interval must be monthly or annual." };
    clean.interval = patch.interval;
  }
  if (!Object.keys(clean).length) return { ok: false, error: "Nothing to change." };
  const before = tenant.data.subscription;
  await provider.setSubscription(tenant.target, clean);
  await tenantAudit(provider, tenant.target, session, "support.subscription_changed", "subscription", before.id, {
    fromTier: before.tier,
    toTier: clean.tier ?? before.tier,
    fromStatus: before.status,
    toStatus: clean.status ?? before.status,
    fromInterval: before.interval,
    toInterval: clean.interval ?? before.interval,
  });
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function extendTenantTrialAction(workspaceId: string, days: number): Promise<ActionResult> {
  const { provider, session } = await opsContext();
  if (session.isDemo) return { ok: false, error: "Demo sessions cannot change a tenant." };
  const tenant = await opsTenantWorkspace(provider, workspaceId);
  if (!tenant.ok) return tenant;
  const extra = Number(days);
  if (!Number.isInteger(extra) || extra < 1 || extra > 365) return { ok: false, error: "Extend by 1 to 365 days." };
  const sub = tenant.data.subscription;
  const now = Date.now();
  const currentEnd = sub.trialEndsAt ? new Date(sub.trialEndsAt).getTime() : NaN;
  const base = Number.isFinite(currentEnd) && currentEnd > now ? currentEnd : now;
  const trialEndsAt = new Date(base + extra * 86_400_000).toISOString();
  await provider.setSubscription(tenant.target, { status: "trialing", trialEndsAt });
  await tenantAudit(provider, tenant.target, session, "support.trial_extended", "subscription", sub.id, {
    days: extra,
    from: sub.trialEndsAt ?? "",
    to: trialEndsAt,
    fromStatus: sub.status,
  });
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function forceTenantSignOutAction(workspaceId: string, userId: string): Promise<ActionResult> {
  const { provider, session } = await opsContext();
  if (session.isDemo) return { ok: false, error: "Demo sessions cannot change a tenant." };
  const tenant = await opsTenantWorkspace(provider, workspaceId);
  if (!tenant.ok) return tenant;
  const user = tenant.users.find((candidate) => candidate.id === String(userId ?? "").trim());
  if (!user) return { ok: false, error: "That user is not on this tenant." };
  await provider.bumpUserSessionVersion(user.id);
  await tenantAudit(provider, tenant.target, session, "support.sessions_revoked", "user", user.id, { email: user.email });
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function setTenantUserEmailVerifiedAction(
  workspaceId: string,
  userId: string,
  verified: boolean,
): Promise<ActionResult> {
  const { provider, session } = await opsContext();
  if (session.isDemo) return { ok: false, error: "Demo sessions cannot change a tenant." };
  const tenant = await opsTenantWorkspace(provider, workspaceId);
  if (!tenant.ok) return tenant;
  const user = tenant.users.find((candidate) => candidate.id === String(userId ?? "").trim());
  if (!user) return { ok: false, error: "That user is not on this tenant." };
  await provider.setEmailVerified(user.id, Boolean(verified));
  await tenantAudit(provider, tenant.target, session, "support.email_verified_set", "user", user.id, {
    email: user.email,
    verified: Boolean(verified),
  });
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/**
 * Delete a whole tenant — every workspace in the organization and all their
 * rows. Irreversible; the operator types the tenant's name. The record of the
 * deletion goes to the ops team's own ledger, because the tenant's is gone.
 */
export async function deleteTenantAction(organizationId: string, confirmName: string): Promise<ActionResult> {
  const { provider, session, home } = await opsContext();
  if (session.isDemo) return { ok: false, error: "Demo sessions cannot delete a tenant." };
  const detail = await provider.getTenantDetail(String(organizationId ?? "").trim());
  if (!detail) return { ok: false, error: "That tenant no longer exists." };
  if (detail.users.some((user) => user.role === "platform_admin")) {
    return { ok: false, error: "That organization belongs to the ops team." };
  }
  if (String(confirmName ?? "").trim().toLowerCase() !== detail.tenant.name.trim().toLowerCase()) {
    return { ok: false, error: `Type the tenant's name exactly — ${detail.tenant.name} — to confirm.` };
  }
  const result = await provider.deleteOrganization(detail.organization.id);
  if (!result.ok) return result;
  await provider.appendAuditLog(home, {
    id: `aud_${randomBytes(8).toString("hex")}`,
    workspaceId: home,
    actor: session.email || "Foundly support",
    action: "support.tenant_deleted",
    targetType: "organization",
    targetId: detail.organization.id,
    at: new Date().toISOString(),
    meta: {
      name: detail.tenant.name,
      workspaces: result.workspaceIds.length,
      users: detail.users.length,
      ownerEmail: detail.tenant.ownerEmail ?? "",
    },
  });
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/**
 * Record an operator's decision on a fraud flag. The flag must exist in the
 * snapshot computed right now and belong to the workspace named, so a stale
 * or forged id cannot write a decision against the wrong tenant. Confirming a
 * flag also tells the tenant: an audit entry and a notification in their
 * console, because a capture practice that trips Google's filters is theirs
 * to fix.
 */
export async function triageFraudFlagAction(
  flagId: string,
  workspaceId: string,
  decision: FraudTriageDecision,
  note?: string,
): Promise<ActionResult> {
  const { provider, session, home } = await opsContext();
  if (session.isDemo) return { ok: false, error: "Demo sessions cannot triage." };
  if (decision !== "dismissed" && decision !== "confirmed") return { ok: false, error: "Pick dismiss or confirm." };
  const id = String(flagId ?? "").trim();
  const snapshot = await provider.getPlatformSnapshot(home);
  const flag = snapshot.fraudFlags.find((candidate) => candidate.id === id && candidate.workspaceId === workspaceId);
  if (!flag?.workspaceId) return { ok: false, error: "That flag is no longer in the queue." };
  const cleanNote = String(note ?? "").trim().slice(0, 400) || undefined;
  await provider.saveFraudTriage({
    flagId: flag.id,
    workspaceId: flag.workspaceId,
    decision,
    operator: session.email || "Foundly support",
    note: cleanNote,
    at: new Date().toISOString(),
  });
  if (decision === "confirmed") {
    await tenantAudit(provider, flag.workspaceId, session, "fraud.flag_confirmed", "fraud_flag", flag.id, {
      kind: flag.kind,
      severity: flag.severity,
      detail: flag.detail,
      ...(cleanNote ? { note: cleanNote } : {}),
    });
    const data = await provider.getData(flag.workspaceId);
    if (data) {
      await provider.appendNotification(flag.workspaceId, {
        id: `ntf_fraud_${flag.id.slice(0, 40)}`,
        locationId: data.location.id,
        kind: "system",
        title: "Foundly flagged a review-capture pattern",
        body: `${flag.detail}. This is the kind of pattern that trips Google's review filters — please review how requests are being sent.`,
        createdAt: new Date().toISOString(),
        read: false,
      }).catch(() => undefined);
    }
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Store today's platform snapshot in the history table (idempotent per day). */
export async function recordPlatformHistoryAction(): Promise<{ ok: true; day: string } | { ok: false; error: string }> {
  const { provider, session, home } = await opsContext();
  if (session.isDemo) return { ok: false, error: "The demo has no platform history." };
  const snapshot = await provider.getPlatformSnapshot(home);
  const record = historyRecordFrom(snapshot, new Date());
  await provider.savePlatformHistory(record);
  revalidatePath("/admin", "layout");
  return { ok: true, day: record.day };
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
 * "Continue on Free" from the trial-ending page.
 *
 * Unlike `downgradeToFreeAction`, this never goes near Stripe: a no-card trial
 * has no Stripe subscription to cancel, so the portal would only answer
 * `not_configured` and leave the owner stuck behind the lock. It is limited to
 * exactly that case — an expired trial with no Stripe subscription — and
 * simply records the Free plan the workspace is already entitled to.
 */
export async function continueOnFreeAction(): Promise<void> {
  const { provider, ws } = await scoped("owner");
  const data = await provider.getData(ws);
  if (!data) throw new Error("The workspace could not be loaded.");
  const sub = data.subscription;
  if (!isTrialExpired(sub) || sub.stripeSubscriptionId) {
    // Not the no-card expired trial this action is for — billing handles it.
    redirect("/app/settings/billing");
  }
  await provider.setSubscription(ws, { tier: "free", status: "free" });
  await provider.appendAuditLog(ws, {
    id: `audit_${randomBytes(12).toString("hex")}`,
    workspaceId: ws,
    actor: data.owner.name,
    action: "billing.trial_continued_on_free",
    targetType: "subscription",
    targetId: sub.id,
    at: new Date().toISOString(),
    meta: sub.trialEndsAt ? { trialEndsAt: sub.trialEndsAt } : undefined,
  });
  revalidatePath("/app", "layout");
  redirect("/app");
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
  const allowed = ["starter", "growth", "multi", "agency"] as const;
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
