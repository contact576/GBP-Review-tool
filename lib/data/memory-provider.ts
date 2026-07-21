import { buildSeed } from "./seed";
import { nanoid } from "nanoid";
import { emptyFoundlyData, makeSlug } from "./empty";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { canonicalPhone } from "@/lib/sms/phone";
import { PLANS } from "@/lib/billing/plans";
import { mergeSuggestionInbox } from "@/lib/suggestions/inbox";
import type {
  DataProvider,
  CaptureCustomerInput,
  AddCustomerInput,
  SendRequestInput,
  RecordDraftInput,
  PostReplyInput,
  CreateCampaignInput,
  SubmitPrivateFeedbackInput,
  RegisterInput,
  RegisterResult,
  AuthUser,
  GoogleLocationPatch,
  CreateTaskInput,
  GoogleSyncResult,
  SaveGoogleCredentialInput,
  GoogleCredential,
  InstagramCredential,
} from "./provider";
// Id conventions + pure helpers only — the server-only Google modules
// (places/profile-sync) are dynamically imported inside the sync methods so
// this data module stays free of "server-only" for unit tests.
import {
  buildGooglePublicUpdate,
  upsertSnapshot,
  isPublicSampleReview,
  isImportedGoogleReview,
  friendlyPlacesError,
} from "@/lib/google/public-sync";
import type {
  FoundlyData,
  Customer,
  CustomerConsent,
  ReviewRequest,
  Review,
  ReviewDraft,
  GbpTask,
  Campaign,
  PrivateFeedback,
  StaffInvite,
  StaffMember,
  IndustryConfig,
  WorkspaceSettings,
  WhiteLabelConfig,
  Integration,
  AiContentAsset,
  ContentPublishingJob,
  MonitoringRun,
  Notification,
} from "./types";

/**
 * In-memory provider — multi-tenant Map keyed by workspaceId.
 * The demo workspace ("ws_harbourview") is lazily seeded; real registrations
 * create EMPTY workspaces. Serverless caveat: memory resets on cold start —
 * real persistence requires DATABASE_URL (Drizzle provider). Demo sessions
 * are always served from here even when a database is configured.
 */

export const DEMO_WORKSPACE_ID = "ws_harbourview";

interface StoredUser {
  id: string;
  name: string;
  email: string; // lowercase
  role: AuthUser["role"];
  workspaceId: string;
  passwordHash?: string;
  googleSub?: string;
  emailVerified: boolean;
}

interface MemoryStore {
  workspaces: Map<string, FoundlyData>;
  users: Map<string, StoredUser>; // key: lowercase email
  credentials: Map<string, GoogleCredential>; // key: workspaceId
  instagramCredentials: Map<string, InstagramCredential>; // key: workspaceId
  aiContentAssets: Map<string, AiContentAsset>; // key: asset id
  contentPublishingJobs: Map<string, ContentPublishingJob>; // key: job id
  monitoringRuns: Map<string, MonitoringRun>; // key: run id
  passwordResets: Map<
    string,
    { userId: string; expiresAt: string; createdAt: string; usedAt?: string }
  >; // key: SHA-256 token hash
}

const globalRef = globalThis as unknown as { __foundlyStore?: MemoryStore };

function store(): MemoryStore {
  if (!globalRef.__foundlyStore) {
    globalRef.__foundlyStore = {
      workspaces: new Map(),
      users: new Map(),
      credentials: new Map(),
      instagramCredentials: new Map(),
      aiContentAssets: new Map(),
      contentPublishingJobs: new Map(),
      monitoringRuns: new Map(),
      passwordResets: new Map(),
    };
  }
  // Back-compat for stores created before credentials existed.
  if (!globalRef.__foundlyStore.credentials) {
    globalRef.__foundlyStore.credentials = new Map();
  }
  if (!globalRef.__foundlyStore.instagramCredentials) {
    globalRef.__foundlyStore.instagramCredentials = new Map();
  }
  if (!globalRef.__foundlyStore.aiContentAssets) {
    globalRef.__foundlyStore.aiContentAssets = new Map();
  }
  if (!globalRef.__foundlyStore.contentPublishingJobs) {
    globalRef.__foundlyStore.contentPublishingJobs = new Map();
  }
  if (!globalRef.__foundlyStore.monitoringRuns) {
    globalRef.__foundlyStore.monitoringRuns = new Map();
  }
  if (!globalRef.__foundlyStore.passwordResets) {
    globalRef.__foundlyStore.passwordResets = new Map();
  }
  return globalRef.__foundlyStore;
}

function db(workspaceId: string): FoundlyData | null {
  const s = store();
  if (!s.workspaces.has(workspaceId)) {
    if (workspaceId === DEMO_WORKSPACE_ID) {
      s.workspaces.set(DEMO_WORKSPACE_ID, buildSeed());
    } else {
      return null;
    }
  }
  return s.workspaces.get(workspaceId) ?? null;
}

function mustDb(workspaceId: string): FoundlyData {
  const data = db(workspaceId);
  if (!data) throw new Error(`Workspace not found: ${workspaceId}`);
  return data;
}

function allWorkspaces(): FoundlyData[] {
  // Ensure demo exists for global token/slug scans on fresh processes.
  db(DEMO_WORKSPACE_ID);
  return [...store().workspaces.values()];
}

function nowIso() {
  return new Date().toISOString();
}
function id(prefix: string) {
  return `${prefix}_${nanoid()}`;
}

function toAuthUser(u: StoredUser, isDemo = false): AuthUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    workspaceId: u.workspaceId,
    isDemo,
  };
}

export const memoryProvider: DataProvider = {
  backed: "memory",

  async getData(workspaceId) {
    return db(workspaceId);
  },

  async listOrganizationWorkspaces(workspaceId) {
    const current = db(workspaceId);
    if (!current) return [];
    return allWorkspaces()
      .filter((data) => data.organization.id === current.organization.id)
      .map((data) => {
        const latest = [...data.metrics].sort((a, b) => a.date.localeCompare(b.date)).pop();
        const trustedScore = data.workspace.isDemo || Boolean(latest?.sources?.scores);
        return {
          workspaceId: data.workspace.id,
          locationId: data.location.id,
          name: data.location.name,
          city: data.location.city,
          rating: data.location.rating,
          reviewCount: data.location.reviewCount,
          growthScore: trustedScore ? latest?.growthScore ?? null : null,
        };
      });
  },

  async listAgencyClients(workspaceId) {
    const current = db(workspaceId);
    if (!current) return [];
    if (current.workspace.isDemo) return current.agency.clients;
    const cutoff = Date.now() - 30 * 86_400_000;
    return current.agency.clients.map((stored) => {
      const child = allWorkspaces().find(
        (candidate) =>
          candidate.organization.id === current.organization.id &&
          candidate.location.id === stored.locationId,
      );
      if (!child) return stored;
      const latest = [...child.metrics].sort((a, b) => a.date.localeCompare(b.date)).pop();
      const growthScore = latest?.sources?.scores ? latest.growthScore : 0;
      const needsReply = child.reviews.filter((review) => review.needsReply).length;
      const newReviews30d = child.reviews.filter(
        (review) => new Date(review.publishedAt).getTime() >= cutoff,
      ).length;
      const status =
        growthScore < 50 || needsReply > 7
          ? "at_risk" as const
          : growthScore < 70 || needsReply > 3
            ? "attention" as const
            : "healthy" as const;
      return {
        ...stored,
        name: child.location.name,
        city: child.location.city,
        growthScore,
        rating: child.location.rating,
        newReviews30d,
        needsReply,
        plan: child.subscription.tier,
        status,
      };
    });
  },

  async createOrganizationWorkspace(workspaceId, input) {
    const current = db(workspaceId);
    if (!current) return { ok: false, error: "Current workspace was not found." };
    const siblings = allWorkspaces().filter(
      (data) => data.organization.id === current.organization.id,
    );
    const plan = PLANS[current.subscription.tier];
    if (siblings.length >= plan.limits.locations) {
      return {
        ok: false,
        error: `${plan.name} supports ${plan.limits.locations} location${plan.limits.locations === 1 ? "" : "s"}. Upgrade to add another.`,
      };
    }
    const nextWorkspaceId = id("ws");
    const data = emptyFoundlyData({
      workspaceId: nextWorkspaceId,
      organizationId: current.organization.id,
      userId: id("usr"),
      businessName: input.businessName,
      ownerName: current.owner.name,
      email: current.owner.email,
      industryKey: input.industryKey,
      category: input.category,
      region: input.region,
      city: input.city,
      address: input.address,
    });
    data.organization = { ...current.organization };
    data.workspace.plan = current.subscription.tier;
    data.subscription.tier = current.subscription.tier;
    data.subscription.status = current.subscription.status;
    data.subscription.interval = current.subscription.interval;
    data.subscription.currency = current.subscription.currency;
    data.subscription.usage.aiDraftsLimit = plan.limits.aiDraftsPerMonth;
    data.subscription.usage.smsCreditsTotal = plan.limits.smsCredits;
    store().workspaces.set(nextWorkspaceId, data);
    if (current.subscription.tier === "agency" && input.contactEmail) {
      current.agency.clients.push({
        locationId: data.location.id,
        name: data.location.name,
        city: data.location.city,
        contactEmail: input.contactEmail,
        growthScore: 0,
        rating: 0,
        newReviews30d: 0,
        needsReply: 0,
        plan: "agency",
        status: "attention",
      });
    }
    const workspace = (await memoryProvider.listOrganizationWorkspaces(nextWorkspaceId)).find(
      (item) => item.workspaceId === nextWorkspaceId,
    );
    return workspace
      ? { ok: true, workspace }
      : { ok: false, error: "The new location could not be loaded." };
  },

  async getReferralSummary(workspaceId) {
    const referrals = allWorkspaces().filter(
      (data) => data.workspace.referredByWorkspaceId === workspaceId,
    );
    const qualified = referrals.filter(
      (data) =>
        data.workspace.referralRewardStatus === "applied" ||
        (data.subscription.status === "active" && data.subscription.tier !== "free"),
    );
    const applied = referrals.filter(
      (data) => data.workspace.referralRewardStatus === "applied",
    );
    return {
      signedUp: referrals.length,
      qualified: qualified.length,
      creditsApplied: applied.length * 50,
      pendingCredits: (qualified.length - applied.length) * 50,
    };
  },

  async getPendingReferralReward(referredWorkspaceId) {
    const referred = db(referredWorkspaceId);
    if (
      !referred?.workspace.referredByWorkspaceId ||
      referred.workspace.referralRewardStatus !== "pending" ||
      referred.subscription.status !== "active" ||
      referred.subscription.tier === "free"
    ) return null;
    const referrer = db(referred.workspace.referredByWorkspaceId);
    const stripeCustomerId = referrer?.subscription.stripeCustomerId;
    if (!referrer || !stripeCustomerId) return null;
    return {
      referredWorkspaceId,
      referrerWorkspaceId: referrer.workspace.id,
      stripeCustomerId,
      currency: referrer.subscription.currency,
    };
  },

  async markReferralRewardApplied(referredWorkspaceId, appliedAt) {
    const referred = db(referredWorkspaceId);
    if (!referred || referred.workspace.referralRewardStatus === "applied") return;
    referred.workspace.referralRewardStatus = "applied";
    referred.workspace.referralRewardAppliedAt = appliedAt;
  },

  // ── Auth ──────────────────────────────────────────────────
  async registerUser(input: RegisterInput): Promise<RegisterResult> {
    const s = store();
    const email = input.email.trim().toLowerCase();
    if (s.users.has(email)) {
      return { ok: false, error: "An account with this email already exists." };
    }
    const userId = id("usr");
    const workspaceId = id("ws");
    const organizationId = id("org");
    const passwordHash = await hashPassword(input.password);

    const data = emptyFoundlyData({
      workspaceId,
      organizationId,
      userId,
      businessName: input.businessName,
      ownerName: input.name,
      email,
      industryKey: input.industryKey,
      category: input.industryKey.replace(/_/g, " "),
      region: input.region,
    });
    if (input.referredByWorkspaceId && s.workspaces.has(input.referredByWorkspaceId)) {
      data.workspace.referredByWorkspaceId = input.referredByWorkspaceId;
      data.workspace.referralRewardStatus = "pending";
    }
    s.workspaces.set(workspaceId, data);

    const user: StoredUser = {
      id: userId,
      name: input.name,
      email,
      role: "owner",
      workspaceId,
      passwordHash,
      emailVerified: true, // auto-verified until email sending is configured
    };
    s.users.set(email, user);
    return { ok: true, user: toAuthUser(user) };
  },

  async verifyCredentials(email, password) {
    const user = store().users.get(email.trim().toLowerCase());
    if (!user?.passwordHash) return null;
    const ok = await verifyPassword(password, user.passwordHash);
    return ok ? toAuthUser(user) : null;
  },

  async getUserByEmail(email) {
    const user = store().users.get(email.trim().toLowerCase());
    return user ? toAuthUser(user) : null;
  },

  async savePasswordResetToken(input) {
    const s = store();
    for (const [hash, record] of s.passwordResets) {
      if (record.userId === input.userId || new Date(record.expiresAt).getTime() <= Date.now()) {
        s.passwordResets.delete(hash);
      }
    }
    s.passwordResets.set(input.tokenHash, {
      userId: input.userId,
      expiresAt: input.expiresAt,
      createdAt: input.createdAt,
    });
  },

  async revokePasswordResetToken(tokenHash) {
    store().passwordResets.delete(tokenHash);
  },

  async consumePasswordResetToken(tokenHash, passwordHash, consumedAt) {
    const s = store();
    const record = s.passwordResets.get(tokenHash);
    if (
      !record ||
      record.usedAt ||
      new Date(record.expiresAt).getTime() <= new Date(consumedAt).getTime()
    ) {
      return false;
    }
    const user = [...s.users.values()].find((candidate) => candidate.id === record.userId);
    if (!user) return false;
    record.usedAt = consumedAt;
    user.passwordHash = passwordHash;
    for (const [hash, candidate] of s.passwordResets) {
      if (candidate.userId === user.id && hash !== tokenHash) s.passwordResets.delete(hash);
    }
    return true;
  },

  async upsertGoogleUser({ googleSub, email, name, referredByWorkspaceId }) {
    const s = store();
    const key = email.trim().toLowerCase();
    const existing = s.users.get(key);
    if (existing) {
      existing.googleSub = googleSub;
      existing.emailVerified = true;
      return toAuthUser(existing);
    }
    // New Google user → workspace pending onboarding details.
    const userId = id("usr");
    const workspaceId = id("ws");
    const data = emptyFoundlyData({
      workspaceId,
      organizationId: id("org"),
      userId,
      businessName: name ? `${name.split(" ")[0]}'s Business` : "My Business",
      ownerName: name || key,
      email: key,
      industryKey: "professional_services",
      category: "Local business",
      region: "US",
    });
    if (referredByWorkspaceId && s.workspaces.has(referredByWorkspaceId)) {
      data.workspace.referredByWorkspaceId = referredByWorkspaceId;
      data.workspace.referralRewardStatus = "pending";
    }
    s.workspaces.set(workspaceId, data);
    const user: StoredUser = {
      id: userId,
      name: name || key,
      email: key,
      role: "owner",
      workspaceId,
      googleSub,
      emailVerified: true,
    };
    s.users.set(key, user);
    return toAuthUser(user);
  },

  // ── Focused reads ─────────────────────────────────────────
  async getCustomer(workspaceId, customerId) {
    const data = db(workspaceId);
    return data?.customers.find((c) => c.id === customerId) ?? null;
  },

  async getRequestByToken(token) {
    for (const data of allWorkspaces()) {
      const request = data.requests.find((r) => r.token === token);
      if (request) return { request, location: data.location };
    }
    return null;
  },

  // ── Core loop mutations ───────────────────────────────────
  async captureCustomer(workspaceId, input: CaptureCustomerInput) {
    const data = mustDb(workspaceId);
    const consent: CustomerConsent = {
      serviceConsent: input.serviceConsent,
      serviceConsentAt: input.serviceConsent ? nowIso() : undefined,
      marketingConsent: input.marketingConsent,
      marketingConsentAt: input.marketingConsent ? nowIso() : undefined,
      consentChannel: "in_person",
      consentSourceText: input.consentSourceText,
      caslCaptured: data.location.region === "CA",
    };
    const customer: Customer = {
      id: id("cus"),
      locationId: data.location.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      createdAt: nowIso(),
      source: "staff",
      staffId: input.staffId,
      visitCount: 1,
      lastVisitAt: nowIso(),
      lastRequestAt: undefined,
      services: input.services,
      sentiment: "neutral",
      lifecycleStage: "new",
      consent,
      tags: [],
    };
    data.customers.unshift(customer);

    const request: ReviewRequest = {
      id: id("req"),
      locationId: data.location.id,
      customerId: customer.id,
      customerName: customer.name,
      staffId: input.staffId,
      channel: input.channel,
      token: id("tok"),
      status: "queued",
      isTest: false,
      createdAt: nowIso(),
      sentAt: undefined,
      attributes: [],
    };
    data.requests.unshift(request);

    const staff = data.staff.find((s) => s.id === input.staffId);
    if (staff) {
      staff.captures += 1;
      staff.lastActiveAt = nowIso();
    }
    data.auditLog.unshift({
      id: id("aud"), workspaceId: data.workspace.id, actor: staff?.displayName ?? "Owner",
      action: "customer.captured", targetType: "customer", targetId: customer.id, at: nowIso(),
    });
    return { customer, request };
  },

  async addCustomer(workspaceId, input: AddCustomerInput) {
    const data = mustDb(workspaceId);
    const customer: Customer = {
      id: id("cus"),
      locationId: data.location.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      createdAt: nowIso(),
      source: "walk_in",
      visitCount: 1,
      lastVisitAt: nowIso(),
      services: input.services,
      sentiment: "neutral",
      lifecycleStage: "new",
      consent: {
        serviceConsent: input.serviceConsent,
        serviceConsentAt: input.serviceConsent ? nowIso() : undefined,
        marketingConsent: input.marketingConsent,
        marketingConsentAt: input.marketingConsent ? nowIso() : undefined,
        consentChannel: "in_person",
        consentSourceText: input.consentSourceText,
        caslCaptured: data.location.region === "CA",
      },
      tags: [],
    };
    data.customers.unshift(customer);
    data.auditLog.unshift({
      id: id("aud"), workspaceId, actor: "Owner",
      action: "customer.added", targetType: "customer", targetId: customer.id, at: nowIso(),
    });
    return customer;
  },

  async addCustomersBulk(workspaceId, inputs: AddCustomerInput[]) {
    const data = mustDb(workspaceId);
    let added = 0;
    let skipped = 0;
    for (const input of inputs) {
      const email = input.email?.trim().toLowerCase();
      // De-dupe by email against existing rows (incl. ones added in this batch).
      if (email && data.customers.some((c) => c.email?.trim().toLowerCase() === email)) {
        skipped += 1;
        continue;
      }
      await memoryProvider.addCustomer(workspaceId, input);
      added += 1;
    }
    return { added, skipped };
  },

  async sendRequest(workspaceId, input: SendRequestInput) {
    const data = mustDb(workspaceId);
    const customer = data.customers.find((c) => c.id === input.customerId);
    const request: ReviewRequest = {
      id: id("req"),
      locationId: data.location.id,
      customerId: input.customerId,
      customerName: customer?.name ?? "Customer",
      staffId: input.staffId,
      channel: input.channel,
      token: id("tok"),
      status: "queued",
      isTest: false,
      createdAt: nowIso(),
      sentAt: undefined,
      attributes: [],
    };
    data.requests.unshift(request);
    return request;
  },

  async setRequestDeliveryStatus(workspaceId, requestId, status, reason) {
    const data = mustDb(workspaceId);
    const request = data.requests.find((item) => item.id === requestId);
    if (!request) return null;
    const accepted = status === "sent" || status === "delivered";
    const firstAccepted = accepted && !request.sentAt;
    request.status = status;
    if (accepted) request.sentAt ??= nowIso();
    if (reason) request.suppressedReason = reason;
    if (firstAccepted) {
      data.subscription.usage.requestsSent += 1;
      if (request.channel === "sms") data.subscription.usage.smsCreditsUsed += 1;
      const customer = data.customers.find((item) => item.id === request.customerId);
      if (customer) {
        customer.lastRequestAt = request.sentAt;
        if (customer.lifecycleStage === "new") customer.lifecycleStage = "requested";
      }
    }
    return request;
  },

  async suppressPhoneGlobally(phone, reason) {
    const needle = canonicalPhone(phone);
    if (!needle) return 0;
    let count = 0;
    for (const data of allWorkspaces()) {
      const matches = data.customers.filter((customer) => canonicalPhone(customer.phone) === needle);
      if (!matches.length) continue;
      if (!data.suppression.some((entry) => entry.matchType === "phone" && canonicalPhone(entry.value) === needle)) {
        data.suppression.unshift({
          id: id("sup"),
          locationId: data.location.id,
          matchType: "phone",
          value: needle,
          reason,
          addedAt: nowIso(),
        });
      }
      for (const customer of matches) {
        customer.suppressedReason = reason;
        customer.consent.serviceConsent = false;
        customer.consent.marketingConsent = false;
        customer.consent.withdrawnAt = nowIso();
        count += 1;
      }
    }
    return count;
  },

  async advanceRequest(token, to, meta) {
    for (const data of allWorkspaces()) {
      const request = data.requests.find((r) => r.token === token);
      if (!request) continue;
      request.status = to;
      if (to === "opened") request.openedAt = nowIso();
      if (to === "clicked" || to === "posted_google" || to === "private_feedback") {
        request.clickedAt ??= nowIso();
      }
      if (meta?.rating) request.rating = meta.rating;
      if (meta?.attributes) request.attributes = meta.attributes;

      const customer = data.customers.find((c) => c.id === request.customerId);
      if (customer) {
        if (to === "opened" && customer.lifecycleStage === "requested") customer.lifecycleStage = "opened";
        if (to === "posted_google") {
          customer.lifecycleStage = "reviewed";
          customer.sentiment = "happy";
        }
        if (to === "private_feedback") customer.sentiment = "unhappy";
      }
      if (to === "posted_google") {
        const staff = data.staff.find((s) => s.id === request.staffId);
        if (staff) staff.detectedReviews += 1;
        data.subscription.usage.reviewsCaptured += 1;
      }
      return request;
    }
    return null;
  },

  async submitPrivateFeedback(input: SubmitPrivateFeedbackInput) {
    for (const data of allWorkspaces()) {
      const req = data.requests.find((r) => r.token === input.token);
      if (!req) continue;
      const fb: PrivateFeedback = {
        id: id("pf"),
        locationId: data.location.id,
        customerName: req.customerName,
        rating: input.rating,
        text: input.text,
        createdAt: nowIso(),
        resolved: false,
      };
      data.privateFeedback.unshift(fb);
      req.status = "private_feedback";
      req.rating = input.rating;
      req.privateFeedback = input.text;
      data.notifications.unshift({
        id: id("ntf"), locationId: data.location.id, kind: "feedback",
        title: "Private feedback needs attention",
        body: `A ${input.rating}-star private note came in from ${req.customerName}.`,
        createdAt: nowIso(), read: false,
      });
      return fb;
    }
    // Token not found — still record nothing, but return a shell so the
    // customer flow never dead-ends.
    return {
      id: id("pf"), locationId: "unknown", customerName: "Customer",
      rating: input.rating, text: input.text, createdAt: nowIso(), resolved: false,
    };
  },

  async resolvePrivateFeedback(workspaceId, feedbackId) {
    const data = mustDb(workspaceId);
    const fb = data.privateFeedback.find((f) => f.id === feedbackId);
    if (fb) fb.resolved = true;
  },

  async recordDraft(workspaceId, input: RecordDraftInput) {
    const data = mustDb(workspaceId);
    const draft: ReviewDraft = {
      id: id("draft"),
      requestId: input.requestId,
      reviewId: input.reviewId,
      kind: input.kind,
      variants: input.variants,
      generatedBy: input.generatedBy,
      createdAt: nowIso(),
    };
    data.drafts.unshift(draft);
    data.subscription.usage.aiDraftsUsed += 1;
    return draft;
  },

  async approveTask(workspaceId, taskId) {
    const data = mustDb(workspaceId);
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) return null;
    task.status = "done";
    data.auditLog.unshift({
      id: id("aud"), workspaceId, actor: "Owner",
      action: "task.completed", targetType: "gbp_task", targetId: task.id, at: nowIso(),
    });
    return task;
  },

  async snoozeTask(workspaceId, taskId) {
    const data = mustDb(workspaceId);
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) return null;
    task.status = "snoozed";
    return task;
  },

  async createGbpTask(workspaceId, input: CreateTaskInput) {
    const data = mustDb(workspaceId);
    const task: GbpTask = {
      id: id("task"),
      locationId: data.location.id,
      isoWeek: "",
      kind: input.kind,
      title: input.title,
      rationale: input.rationale,
      preview: input.preview,
      status: "suggested",
      impact: input.impact,
      effortMins: 2,
      createdAt: nowIso(),
    };
    data.tasks.unshift(task);
    return task;
  },

  async postReply(workspaceId, input: PostReplyInput) {
    const data = mustDb(workspaceId);
    const review = data.reviews.find((r) => r.id === input.reviewId);
    if (!review) return null;
    review.reply = {
      id: id("rpl"), text: input.text, tone: input.tone, source: "ai",
      postedAt: nowIso(), approvedBy: "Owner",
    };
    review.needsReply = false;
    data.auditLog.unshift({
      id: id("aud"), workspaceId, actor: "Owner",
      action: "review.reply_saved", targetType: "review", targetId: review.id, at: nowIso(),
    });
    return review;
  },

  async createCampaign(workspaceId, input: CreateCampaignInput) {
    const data = mustDb(workspaceId);
    const pool = data.customers.filter((c) =>
      input.consentBasis === "marketing"
        ? c.consent.marketingConsent && !c.consent.withdrawnAt
        : c.consent.serviceConsent,
    );
    const total = data.customers.length;
    const consented = pool.length;
    const campaign: Campaign = {
      id: id("camp"),
      locationId: data.location.id,
      name: input.name,
      type: input.type,
      isAutomation: false,
      consentBasis: input.consentBasis,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      status: "draft",
      scheduledAt: input.scheduledAt,
      audienceTotal: total,
      audienceConsented: consented,
      excluded: [
        {
          reason: input.consentBasis === "marketing" ? "Not opted in to marketing" : "No service consent",
          count: total - consented,
        },
      ],
      stats: { sent: 0, opened: 0, clicked: 0 },
      createdAt: nowIso(),
    };
    data.campaigns.unshift(campaign);
    return campaign;
  },

  async setCampaignStatus(workspaceId, campaignId, status) {
    const data = mustDb(workspaceId);
    const campaign = data.campaigns.find((c) => c.id === campaignId);
    if (campaign) campaign.status = status;
  },

  async updateConsent(workspaceId, customerId, consent) {
    const data = mustDb(workspaceId);
    const customer = data.customers.find((c) => c.id === customerId);
    if (!customer) return null;
    customer.consent = { ...customer.consent, ...consent };
    return customer;
  },

  // ── QR ────────────────────────────────────────────────────
  async getWorkspaceIdBySlug(slug) {
    for (const data of allWorkspaces()) {
      if (data.qrAssets.some((q) => q.slug === slug)) return data.workspace.id;
    }
    return null;
  },

  async mintRequestFromQrSlug(slug) {
    for (const data of allWorkspaces()) {
      const asset = data.qrAssets.find((q) => q.slug === slug);
      if (!asset) continue;
      if (asset.degraded) return null;
      asset.scans += 1;
      asset.pageOpens += 1;

      const customer: Customer = {
        id: id("cus"),
        locationId: data.location.id,
        name: "Walk-in customer",
        createdAt: nowIso(),
        source: "walk_in",
        staffId: asset.staffId,
        visitCount: 1,
        lastVisitAt: nowIso(),
        services: [],
        sentiment: "neutral",
        lifecycleStage: "requested",
        consent: {
          // Self-initiated scan: no contact captured, no messaging consent
          // implied — nothing will ever be sent to this record.
          serviceConsent: false,
          marketingConsent: false,
          consentChannel: "in_person",
          consentSourceText: "Self-initiated in-store QR scan — no contact captured.",
          caslCaptured: false,
        },
        tags: ["QR scan"],
      };
      data.customers.unshift(customer);

      const request: ReviewRequest = {
        id: id("req"),
        locationId: data.location.id,
        customerId: customer.id,
        customerName: customer.name,
        staffId: asset.staffId,
        channel: "email",
        token: id("tok"),
        status: "opened",
        isTest: false,
        createdAt: nowIso(),
        sentAt: nowIso(),
        openedAt: nowIso(),
        attributes: [],
      };
      data.requests.unshift(request);
      return { token: request.token, business: data.location.name };
    }
    return null;
  },

  // ── Workspace configuration ───────────────────────────────
  async updateIndustry(workspaceId, industryKey, config?: IndustryConfig) {
    const data = mustDb(workspaceId);
    data.workspace.vertical = industryKey;
    data.location.vertical = industryKey;
    if (config) data.workspace.industryConfig = config;
  },

  async updateWorkspaceSettings(workspaceId, patch: Partial<WorkspaceSettings>) {
    const data = mustDb(workspaceId);
    data.workspace.settings = {
      serviceConsentDefault: true,
      marketingOptInVisible: true,
      quietHours: true,
      leaderboardVisible: true,
      ...data.workspace.settings,
      ...patch,
    };
  },

  async updateLocationGoogle(workspaceId, patch: GoogleLocationPatch) {
    const data = mustDb(workspaceId);
    data.location.googlePlaceId = patch.placeId;
    data.location.reviewUrl = `https://search.google.com/local/writereview?placeid=${patch.placeId}`;
    if (patch.name) data.location.name = patch.name;
    if (patch.address) data.location.address = patch.address;
    if (patch.city) data.location.city = patch.city;
    if (typeof patch.rating === "number") data.location.rating = patch.rating;
    if (typeof patch.reviewCount === "number") data.location.reviewCount = patch.reviewCount;
    if (patch.category) {
      data.location.category = patch.category;
      data.location.profile.primaryCategory = patch.category;
    }
    // Update QR targets to the (now real) Google review URL.
    for (const qr of data.qrAssets) qr.targetUrl = data.location.reviewUrl;
    const places = data.integrations.find((i) => i.provider === "google_places");
    if (places) {
      places.status = "connected";
      places.detail = "Business matched on Google";
      places.lastSyncAt = nowIso();
    }
  },

  async saveRankGridScan(workspaceId, scan) {
    const data = mustDb(workspaceId);
    data.rankScans = [scan, ...data.rankScans.filter((item) => item.id !== scan.id)].slice(0, 24);
  },

  async markAgencyReportsSent(workspaceId, locationIds, sentAt) {
    const data = mustDb(workspaceId);
    const selected = new Set(locationIds);
    data.agency.clients = data.agency.clients.map((client) =>
      selected.has(client.locationId) ? { ...client, lastReportSent: sentAt } : client,
    );
  },

  async updateWhiteLabel(workspaceId, config: WhiteLabelConfig) {
    const data = mustDb(workspaceId);
    data.agency.whiteLabel = config;
    if (data.workspace.whiteLabel) data.workspace.whiteLabel = config;
  },

  // ── Feature flags ─────────────────────────────────────────
  async setFeatureFlag(workspaceId, key, enabled) {
    const data = mustDb(workspaceId);
    const flag = data.featureFlags.find((f) => f.key === key);
    if (flag) flag.enabled = enabled;
  },

  // ── Billing / subscription ────────────────────────────────
  async setSubscription(workspaceId, patch) {
    const data = mustDb(workspaceId);
    if (patch.status !== undefined) data.subscription.status = patch.status;
    if (patch.tier !== undefined) data.subscription.tier = patch.tier;
    if (patch.interval !== undefined) data.subscription.interval = patch.interval;
    if (patch.stripeCustomerId !== undefined) data.subscription.stripeCustomerId = patch.stripeCustomerId;
    if (patch.stripeSubscriptionId !== undefined) data.subscription.stripeSubscriptionId = patch.stripeSubscriptionId;
    if (patch.stripePriceId !== undefined) data.subscription.stripePriceId = patch.stripePriceId;
    if (patch.currentPeriodEnd !== undefined) data.subscription.currentPeriodEnd = patch.currentPeriodEnd;
    if (patch.cancelAtPeriodEnd !== undefined) data.subscription.cancelAtPeriodEnd = patch.cancelAtPeriodEnd;
  },

  async setIntegrationStatus(workspaceId, provider, status, detail) {
    const data = mustDb(workspaceId);
    const integration = data.integrations.find((i) => i.provider === provider);
    if (integration) {
      integration.status = status;
      integration.detail = detail;
      integration.lastSyncAt = nowIso();
    } else {
      const entry: Integration = {
        id: id("int"),
        locationId: data.location.id,
        provider,
        label: provider,
        status,
        detail,
        lastSyncAt: nowIso(),
      };
      data.integrations.push(entry);
    }
  },

  // ── Google data sync ──────────────────────────────────────
  async syncGooglePublic(workspaceId): Promise<GoogleSyncResult> {
    const data = mustDb(workspaceId);
    if (data.workspace.isDemo) {
      return { ok: false, error: "The demo uses sample data — sign up to sync your real Google data." };
    }
    const placeId = data.location.googlePlaceId;
    if (!placeId) {
      return { ok: false, error: "Find your business on Google first (Onboarding → Find your business)." };
    }
    const { getPlaceDetails } = await import("@/lib/google/places");
    const res = await getPlaceDetails(placeId);
    if (!res.ok) return { ok: false, error: friendlyPlacesError(res.reason) };

    const update = buildGooglePublicUpdate(res.details, data.location, nowIso());
    data.location.rating = update.rating;
    data.location.reviewCount = update.reviewCount;
    // Replace the prior public sample; keep GBP-imported + owner reviews.
    data.reviews = [
      ...update.reviews,
      ...data.reviews.filter((r) => !isPublicSampleReview(r.id)),
    ];
    data.metrics = upsertSnapshot(data.metrics, update.snapshot);
    const places = data.integrations.find((i) => i.provider === "google_places");
    if (places) {
      places.status = "connected";
      places.detail = `Public Google data synced — ${update.reviewCount} reviews, ${update.rating.toFixed(1)}★`;
      places.lastSyncAt = update.syncedAt;
    }
    return {
      ok: true,
      rating: update.rating,
      reviewCount: update.reviewCount,
      reviewsImported: update.reviews.length,
    };
  },

  async syncGoogleProfile(workspaceId): Promise<GoogleSyncResult> {
    const data = mustDb(workspaceId);
    if (data.workspace.isDemo) {
      return { ok: false, error: "The demo uses sample data." };
    }
    const credential = store().credentials.get(workspaceId) ?? null;
    const { fetchGoogleProfile, locationFromProfileSnapshot } = await import("@/lib/google/profile-sync");
    const outcome = await fetchGoogleProfile(
      credential,
      data.location,
      nowIso(),
      store().instagramCredentials.get(workspaceId) ?? null,
    );
    if (!outcome.ok) return { ok: false, error: outcome.error };

    if (outcome.pendingApproval) {
      const g = data.integrations.find((i) => i.provider === "google");
      if (g) {
        g.status = "needs_attention";
        g.detail =
          "Connected — Google Business Profile API approval pending (Google approves per-project; typically 1–2 weeks)";
      }
      return { ok: true, pendingApproval: true };
    }

    if (outcome.profileSnapshot) {
      data.location = locationFromProfileSnapshot(data.location, outcome.profileSnapshot);
    }
    if (outcome.profileAudit) data.location.gbpAudit = outcome.profileAudit;
    if (outcome.suggestionInbox) {
      data.location.suggestionInbox = mergeSuggestionInbox(
        data.location.suggestionInbox ?? [],
        outcome.suggestionInbox,
      );
    }
    if (typeof outcome.rating === "number") data.location.rating = outcome.rating;
    if (typeof outcome.reviewCount === "number") data.location.reviewCount = outcome.reviewCount;
    const imported = outcome.reviews ?? [];
    // Full history supersedes both the public sample and any prior GBP import.
    data.reviews = [
      ...imported,
      ...data.reviews.filter((r) => !isImportedGoogleReview(r.id)),
    ];
    for (const snapshot of outcome.performanceSnapshots ?? []) {
      data.metrics = upsertSnapshot(data.metrics, snapshot);
    }
    if (outcome.snapshot) data.metrics = upsertSnapshot(data.metrics, outcome.snapshot);
    data.location.gbpConnected = true;
    const g = data.integrations.find((i) => i.provider === "google");
    if (g) {
      g.status = outcome.performanceError ? "needs_attention" : "connected";
      g.detail = `Google Business Profile synced — ${outcome.reviewCount ?? imported.length} reviews`;
      if (outcome.performanceError) {
        g.detail = `Reviews synced; GBP performance unavailable - ${outcome.performanceError}`;
      } else {
        g.detail = `Google Business Profile synced - ${outcome.reviewCount ?? imported.length} reviews and performance`;
      }
      g.lastSyncAt = nowIso();
    }
    const external = outcome.profileSnapshot?.externalEvidence;
    if (external) {
      updateMemoryIntegration(data, "website", external.website.status, external.website.error ?? `${external.website.pages.length} website pages cross-checked`);
      updateMemoryIntegration(data, "search_console", external.searchConsole.status, external.searchConsole.error ?? `${external.searchConsole.rows.length} Search Console query rows synced`);
      updateMemoryIntegration(data, "instagram", external.instagram.status, external.instagram.error ?? `${external.instagram.media.length} Instagram posts synced`);
    }
    return {
      ok: true,
      rating: outcome.rating,
      reviewCount: outcome.reviewCount,
      reviewsImported: imported.length,
      capabilityScore: outcome.profileSnapshot?.capabilityScore.score,
      mediaImported: outcome.profileSnapshot?.media.length,
      warnings: outcome.profileSnapshot?.warnings,
      auditFindings: outcome.profileAudit?.summary.openFindings,
      suggestionsCreated: outcome.suggestionInbox?.length,
    };
  },

  async saveGoogleCredential(workspaceId, input: SaveGoogleCredentialInput) {
    const now = nowIso();
    const existing = store().credentials.get(workspaceId);
    store().credentials.set(workspaceId, {
      workspaceId,
      encryptedRefreshToken: input.encryptedRefreshToken,
      googleAccount: input.googleAccount ?? existing?.googleAccount,
      scopes: input.scopes,
      connectedAt: existing?.connectedAt ?? now,
      updatedAt: now,
    });
  },

  async getGoogleCredential(workspaceId) {
    return store().credentials.get(workspaceId) ?? null;
  },

  async saveInstagramCredential(workspaceId, input) {
    const now = nowIso();
    const existing = store().instagramCredentials.get(workspaceId);
    store().instagramCredentials.set(workspaceId, {
      workspaceId,
      encryptedAccessToken: input.encryptedAccessToken,
      accountId: input.accountId,
      username: input.username ?? existing?.username,
      scopes: input.scopes,
      expiresAt: input.expiresAt,
      connectedAt: existing?.connectedAt ?? now,
      updatedAt: now,
    });
  },

  async getInstagramCredential(workspaceId) {
    return store().instagramCredentials.get(workspaceId) ?? null;
  },

  async updateProfileSuggestion(workspaceId, suggestionId, patch) {
    const data = mustDb(workspaceId);
    const suggestion = (data.location.suggestionInbox ?? []).find((item) => item.id === suggestionId);
    if (!suggestion) return null;
    Object.assign(suggestion, patch);
    return suggestion;
  },

  async createProfileMutationJob(workspaceId, job) {
    const data = mustDb(workspaceId);
    data.mutationJobs ??= [];
    const existing = data.mutationJobs.find((item) => item.idempotencyKey === job.idempotencyKey);
    if (existing) return { job: existing, created: false };
    if (job.workspaceId !== workspaceId) throw new Error("Mutation job workspace mismatch.");
    data.mutationJobs.unshift(job);
    return { job, created: true };
  },

  async updateProfileMutationJob(workspaceId, jobId, patch) {
    const data = mustDb(workspaceId);
    data.mutationJobs ??= [];
    const job = data.mutationJobs.find((item) => item.id === jobId);
    if (!job) return null;
    Object.assign(job, patch);
    return job;
  },

  async getProfileMutationJobByIdempotency(workspaceId, idempotencyKey) {
    const data = mustDb(workspaceId);
    data.mutationJobs ??= [];
    return data.mutationJobs.find((item) => item.idempotencyKey === idempotencyKey) ?? null;
  },

  async createContentPublishingJob(workspaceId, job) {
    if (job.workspaceId !== workspaceId) throw new Error("Content publishing job workspace mismatch.");
    const existing = [...store().contentPublishingJobs.values()].find(
      (item) => item.workspaceId === workspaceId && item.idempotencyKey === job.idempotencyKey,
    );
    if (existing) return { job: existing, created: false };
    store().contentPublishingJobs.set(job.id, job);
    return { job, created: true };
  },

  async updateContentPublishingJob(workspaceId, jobId, patch) {
    const job = store().contentPublishingJobs.get(jobId);
    if (!job || job.workspaceId !== workspaceId) return null;
    Object.assign(job, patch);
    return job;
  },

  async getContentPublishingJobByIdempotency(workspaceId, idempotencyKey) {
    return [...store().contentPublishingJobs.values()].find(
      (item) => item.workspaceId === workspaceId && item.idempotencyKey === idempotencyKey,
    ) ?? null;
  },

  async listGoogleConnectedWorkspaceIds() {
    return [...store().credentials.keys()].filter((workspaceId) => {
      const data = db(workspaceId);
      return Boolean(data && !data.workspace.isDemo);
    });
  },

  async createMonitoringRun(workspaceId, run) {
    if (run.workspaceId !== workspaceId) throw new Error("Monitoring run workspace mismatch.");
    const existing = [...store().monitoringRuns.values()].find(
      (item) => item.workspaceId === workspaceId && item.windowKey === run.windowKey,
    );
    if (existing) return { run: existing, created: false };
    store().monitoringRuns.set(run.id, run);
    return { run, created: true };
  },

  async updateMonitoringRun(workspaceId, runId, patch) {
    const run = store().monitoringRuns.get(runId);
    if (!run || run.workspaceId !== workspaceId) return null;
    Object.assign(run, patch);
    return run;
  },

  async getMonitoringRunByWindow(workspaceId, windowKey) {
    return [...store().monitoringRuns.values()].find(
      (item) => item.workspaceId === workspaceId && item.windowKey === windowKey,
    ) ?? null;
  },

  async saveAiContentAsset(workspaceId, asset) {
    if (asset.workspaceId !== workspaceId) throw new Error("AI content asset workspace mismatch.");
    for (const [id, current] of store().aiContentAssets) {
      if (current.workspaceId === workspaceId && current.suggestionId === asset.suggestionId && id !== asset.id) {
        store().aiContentAssets.delete(id);
      }
    }
    store().aiContentAssets.set(asset.id, asset);
  },

  async getAiContentAssetById(workspaceId, assetId) {
    const asset = store().aiContentAssets.get(assetId);
    return asset?.workspaceId === workspaceId ? asset : null;
  },

  async getAiContentAssetBySuggestion(workspaceId, suggestionId) {
    return [...store().aiContentAssets.values()].find(
      (asset) => asset.workspaceId === workspaceId && asset.suggestionId === suggestionId,
    ) ?? null;
  },

  async appendAuditLog(workspaceId, entry) {
    const data = mustDb(workspaceId);
    if (entry.workspaceId !== workspaceId) throw new Error("Audit log workspace mismatch.");
    if (!data.auditLog.some((item) => item.id === entry.id)) data.auditLog.unshift(entry);
  },

  async appendNotification(workspaceId, notification: Notification) {
    const data = mustDb(workspaceId);
    if (notification.locationId !== data.location.id) throw new Error("Notification location mismatch.");
    if (!data.notifications.some((item) => item.id === notification.id)) data.notifications.unshift(notification);
  },

  // ── Team ──────────────────────────────────────────────────
  async createStaffInvite(workspaceId, email, role) {
    const data = mustDb(workspaceId);
    const key = email.trim().toLowerCase();
    const existing = data.invites.find((i) => i.email === key && i.status === "pending");
    if (existing) return { error: "An invite for this email is already pending." };
    if (data.owner.email === key) return { error: "That's the owner's email." };
    const invite: StaffInvite = {
      id: id("inv"),
      workspaceId,
      email: key,
      role,
      token: id("invtok"),
      status: "pending",
      createdAt: nowIso(),
    };
    data.invites.unshift(invite);
    data.auditLog.unshift({
      id: id("aud"), workspaceId, actor: "Owner",
      action: "staff.invited", targetType: "staff_invite", targetId: invite.id, at: nowIso(),
    });
    return invite;
  },

  async addStaffMember(workspaceId, displayName) {
    const data = mustDb(workspaceId);
    const member: StaffMember = {
      id: id("stf"),
      locationId: data.location.id,
      displayName,
      role: "staff",
      qrToken: id("qrt"),
      active: true,
      streakDays: 0,
      captures: 0,
      detectedReviews: 0,
      avatarInitials: displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
    };
    data.staff.push(member);
    // Personal QR for attribution.
    data.qrAssets.push({
      id: id("qr"),
      locationId: data.location.id,
      scope: "staff",
      staffId: member.id,
      label: `${displayName.split(" ")[0]}'s QR`,
      slug: makeSlug(`${data.location.name}-${displayName.split(" ")[0] ?? "staff"}`, member.id),
      targetUrl: data.location.reviewUrl,
      scans: 0,
      pageOpens: 0,
      degraded: false,
    });
    return member;
  },

  // ── Notifications ─────────────────────────────────────────
  async markNotificationsRead(workspaceId) {
    const data = mustDb(workspaceId);
    for (const n of data.notifications) n.read = true;
  },

  // ── Demo ──────────────────────────────────────────────────
  async resetDemo() {
    store().workspaces.set(DEMO_WORKSPACE_ID, buildSeed());
  },
};

function updateMemoryIntegration(
  data: FoundlyData,
  provider: Integration["provider"],
  sourceStatus: "synced" | "not_connected" | "not_authorized" | "unavailable" | "error",
  detail: string,
): void {
  const status: Integration["status"] = sourceStatus === "synced"
    ? "connected"
    : sourceStatus === "not_connected"
      ? "disconnected"
      : "needs_attention";
  const existing = data.integrations.find((item) => item.provider === provider);
  if (existing) {
    existing.status = status;
    existing.detail = detail;
    if (status === "connected") existing.lastSyncAt = nowIso();
    return;
  }
  data.integrations.push({
    id: `int_${provider}_${data.location.id}`,
    locationId: data.location.id,
    provider,
    label: provider === "website" ? "Business website" : provider === "search_console" ? "Google Search Console" : "Instagram professional account",
    status,
    detail,
    ...(status === "connected" ? { lastSyncAt: nowIso() } : {}),
  });
}
