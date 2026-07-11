import { buildSeed } from "./seed";
import type {
  DataProvider,
  CaptureCustomerInput,
  SendRequestInput,
  RecordDraftInput,
  PostReplyInput,
  CreateCampaignInput,
  SubmitPrivateFeedbackInput,
} from "./provider";
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
} from "./types";

/**
 * In-memory provider — a module-level singleton seeded from buildSeed().
 * Persists within a warm process; resets on cold start (fine for the demo).
 * Mutations patch the singleton so every clicked flow is reflected on reload.
 */

// Preserve the singleton across Next.js dev/HMR reloads.
const globalRef = globalThis as unknown as { __foundlyData?: FoundlyData };

function db(): FoundlyData {
  if (!globalRef.__foundlyData) {
    globalRef.__foundlyData = buildSeed();
  }
  return globalRef.__foundlyData;
}

function nowIso() {
  return new Date().toISOString();
}
function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export const memoryProvider: DataProvider = {
  backed: "memory",

  async getData() {
    return db();
  },

  async getCustomer(customerId) {
    return db().customers.find((c) => c.id === customerId) ?? null;
  },

  async getRequestByToken(token) {
    const data = db();
    const request = data.requests.find((r) => r.token === token);
    if (!request) return null;
    return { request, location: data.location };
  },

  async captureCustomer(input: CaptureCustomerInput) {
    const data = db();
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
      locationId: input.locationId,
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
      locationId: input.locationId,
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

    // Attribution + streak bump.
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

  async sendRequest(input: SendRequestInput) {
    const data = db();
    const customer = data.customers.find((c) => c.id === input.customerId);
    const request: ReviewRequest = {
      id: id("req"),
      locationId: input.locationId,
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
    const data = db();
    const request = data.requests.find((r) => r.token === token);
    if (!request) return null;
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
    return request;
  },

  async submitPrivateFeedback(input: SubmitPrivateFeedbackInput) {
    const data = db();
    const req = data.requests.find((r) => r.token === input.token);
    const fb: PrivateFeedback = {
      id: id("pf"),
      locationId: data.location.id,
      customerName: req?.customerName ?? "Customer",
      rating: input.rating,
      text: input.text,
      createdAt: nowIso(),
      resolved: false,
    };
    data.privateFeedback.unshift(fb);
    if (req) {
      req.status = "private_feedback";
      req.rating = input.rating;
      req.privateFeedback = input.text;
    }
    data.notifications.unshift({
      id: id("ntf"), locationId: data.location.id, kind: "feedback",
      title: "Private feedback needs attention",
      body: `A ${input.rating}★ private note came in.`, createdAt: nowIso(), read: false,
    });
    return fb;
  },

  async recordDraft(input: RecordDraftInput) {
    const data = db();
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

  async approveTask(taskId) {
    const data = db();
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) return null;
    task.status = "done";
    data.location.profile.completeness = Math.min(100, data.location.profile.completeness + 3);
    if (task.kind === "post") data.location.profile.postCount += 1;
    if (task.kind === "qna") data.location.profile.qnaCount += 1;
    data.auditLog.unshift({
      id: id("aud"), workspaceId: data.workspace.id, actor: "Owner",
      action: "task.approved", targetType: "gbp_task", targetId: task.id, at: nowIso(),
    });
    return task;
  },

  async snoozeTask(taskId) {
    const data = db();
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) return null;
    task.status = "snoozed";
    return task;
  },

  async postReply(input: PostReplyInput) {
    const data = db();
    const review = data.reviews.find((r) => r.id === input.reviewId);
    if (!review) return null;
    review.reply = {
      id: id("rpl"), text: input.text, tone: input.tone, source: "ai",
      postedAt: nowIso(), approvedBy: "Owner",
    };
    review.needsReply = false;
    data.location.profile.responseRate = Math.min(1, data.location.profile.responseRate + 0.02);
    data.auditLog.unshift({
      id: id("aud"), workspaceId: data.workspace.id, actor: "Owner",
      action: "review.replied", targetType: "review", targetId: review.id, at: nowIso(),
    });
    return review;
  },

  async createCampaign(input: CreateCampaignInput) {
    const data = db();
    const pool = data.customers.filter((c) =>
      input.consentBasis === "marketing"
        ? c.consent.marketingConsent && !c.consent.withdrawnAt
        : c.consent.serviceConsent,
    );
    const total = data.customers.length;
    const consented = pool.length;
    const campaign: Campaign = {
      id: id("camp"),
      locationId: input.locationId,
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

  async updateConsent(customerId, consent) {
    const data = db();
    const customer = data.customers.find((c) => c.id === customerId);
    if (!customer) return null;
    customer.consent = { ...customer.consent, ...consent };
    return customer;
  },

  async resetDemo() {
    globalRef.__foundlyData = buildSeed();
  },
};
