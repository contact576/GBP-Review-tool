import { buildSeed } from "./seed";
import { emptyFoundlyData, makeSlug } from "./empty";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
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
}

const globalRef = globalThis as unknown as { __foundlyStore?: MemoryStore };

function store(): MemoryStore {
  if (!globalRef.__foundlyStore) {
    globalRef.__foundlyStore = {
      workspaces: new Map(),
      users: new Map(),
      credentials: new Map(),
    };
  }
  // Back-compat for stores created before credentials existed.
  if (!globalRef.__foundlyStore.credentials) {
    globalRef.__foundlyStore.credentials = new Map();
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
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
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

  async upsertGoogleUser({ googleSub, email, name }) {
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
      lastRequestAt: nowIso(),
      services: input.services,
      sentiment: "neutral",
      lifecycleStage: "requested",
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
      status: input.serviceConsent ? "sent" : "queued",
      isTest: false,
      createdAt: nowIso(),
      sentAt: input.serviceConsent ? nowIso() : undefined,
      attributes: [],
    };
    data.requests.unshift(request);

    const staff = data.staff.find((s) => s.id === input.staffId);
    if (staff) {
      staff.captures += 1;
      staff.lastActiveAt = nowIso();
    }
    data.subscription.usage.requestsSent += 1;
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
      status: "sent",
      isTest: false,
      createdAt: nowIso(),
      sentAt: nowIso(),
      attributes: [],
    };
    data.requests.unshift(request);
    if (customer) {
      customer.lastRequestAt = nowIso();
      if (customer.lifecycleStage === "new") customer.lifecycleStage = "requested";
    }
    data.subscription.usage.requestsSent += 1;
    return request;
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
    data.location.profile.completeness = Math.min(100, data.location.profile.completeness + 3);
    if (task.kind === "post") data.location.profile.postCount += 1;
    if (task.kind === "qna") data.location.profile.qnaCount += 1;
    data.auditLog.unshift({
      id: id("aud"), workspaceId, actor: "Owner",
      action: "task.approved", targetType: "gbp_task", targetId: task.id, at: nowIso(),
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
    data.location.profile.responseRate = Math.min(1, data.location.profile.responseRate + 0.02);
    data.auditLog.unshift({
      id: id("aud"), workspaceId, actor: "Owner",
      action: "review.replied", targetType: "review", targetId: review.id, at: nowIso(),
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
      status: input.scheduledAt ? "scheduled" : "sending",
      scheduledAt: input.scheduledAt,
      audienceTotal: total,
      audienceConsented: consented,
      excluded: [
        {
          reason: input.consentBasis === "marketing" ? "Not opted in to marketing" : "No service consent",
          count: total - consented,
        },
      ],
      stats: { sent: input.scheduledAt ? 0 : consented, opened: 0, clicked: 0 },
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

  async updateWhiteLabel(workspaceId, config: WhiteLabelConfig) {
    const data = mustDb(workspaceId);
    data.agency.whiteLabel = config;
    if (data.workspace.whiteLabel) data.workspace.whiteLabel = config;
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
    const { fetchGoogleProfile } = await import("@/lib/google/profile-sync");
    const outcome = await fetchGoogleProfile(credential, data.location, nowIso());
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

    if (typeof outcome.rating === "number") data.location.rating = outcome.rating;
    if (typeof outcome.reviewCount === "number") data.location.reviewCount = outcome.reviewCount;
    const imported = outcome.reviews ?? [];
    // Full history supersedes both the public sample and any prior GBP import.
    data.reviews = [
      ...imported,
      ...data.reviews.filter((r) => !isImportedGoogleReview(r.id)),
    ];
    if (outcome.snapshot) data.metrics = upsertSnapshot(data.metrics, outcome.snapshot);
    data.location.gbpConnected = true;
    const g = data.integrations.find((i) => i.provider === "google");
    if (g) {
      g.status = "connected";
      g.detail = `Google Business Profile synced — ${outcome.reviewCount ?? imported.length} reviews`;
      g.lastSyncAt = nowIso();
    }
    return {
      ok: true,
      rating: outcome.rating,
      reviewCount: outcome.reviewCount,
      reviewsImported: imported.length,
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
