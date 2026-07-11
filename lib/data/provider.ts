import type {
  FoundlyData,
  Customer,
  CustomerConsent,
  ReviewRequest,
  Review,
  ReviewReply,
  ReviewDraft,
  GbpTask,
  Campaign,
  Channel,
  ReplyTone,
  DraftVariant,
  LocationId,
  CustomerId,
  RequestId,
  TaskId,
  PrivateFeedback,
} from "./types";

// ── Mutation inputs ─────────────────────────────────────────
export interface CaptureCustomerInput {
  locationId: LocationId;
  name: string;
  email?: string;
  phone?: string;
  staffId?: string;
  channel: Channel;
  services: string[];
  serviceConsent: boolean;
  marketingConsent: boolean;
  consentSourceText: string;
}

export interface SendRequestInput {
  locationId: LocationId;
  customerId: CustomerId;
  channel: Channel;
  staffId?: string;
}

export interface RecordDraftInput {
  requestId?: RequestId;
  reviewId?: string;
  kind: "review" | "reply";
  variants: DraftVariant[];
  generatedBy: "ai" | "template";
}

export interface PostReplyInput {
  reviewId: string;
  text: string;
  tone: ReplyTone;
}

export interface CreateCampaignInput {
  locationId: LocationId;
  name: string;
  type: Campaign["type"];
  consentBasis: "service" | "marketing";
  channel: Channel;
  subject?: string;
  body: string;
  scheduledAt?: string;
}

export interface SubmitPrivateFeedbackInput {
  token: string;
  rating: 1 | 2 | 3;
  text: string;
}

/**
 * The single data-access contract. Every server component, server action,
 * and route talks to this — never to a concrete store or ORM directly.
 * The demo uses MemoryProvider; a Postgres/Drizzle adapter implements the
 * identical signature when DATABASE_URL is set.
 */
export interface DataProvider {
  readonly backed: "memory" | "postgres";

  // Whole-dataset read (server components hydrate from this).
  getData(): Promise<FoundlyData>;

  // Focused reads
  getCustomer(id: CustomerId): Promise<Customer | null>;
  getRequestByToken(
    token: string,
  ): Promise<{ request: ReviewRequest; location: FoundlyData["location"] } | null>;

  // Mutations (the flows users actually click)
  captureCustomer(
    input: CaptureCustomerInput,
  ): Promise<{ customer: Customer; request: ReviewRequest }>;
  sendRequest(input: SendRequestInput): Promise<ReviewRequest>;
  advanceRequest(
    token: string,
    to: "opened" | "clicked" | "posted_google" | "private_feedback",
    meta?: { rating?: 1 | 2 | 3 | 4 | 5; attributes?: string[] },
  ): Promise<ReviewRequest | null>;
  submitPrivateFeedback(input: SubmitPrivateFeedbackInput): Promise<PrivateFeedback>;
  recordDraft(input: RecordDraftInput): Promise<ReviewDraft>;
  approveTask(id: TaskId): Promise<GbpTask | null>;
  snoozeTask(id: TaskId): Promise<GbpTask | null>;
  postReply(input: PostReplyInput): Promise<Review | null>;
  createCampaign(input: CreateCampaignInput): Promise<Campaign>;
  updateConsent(
    id: CustomerId,
    consent: Partial<CustomerConsent>,
  ): Promise<Customer | null>;
  resetDemo(): Promise<void>;
}

export type { Customer, Review, ReviewReply };
