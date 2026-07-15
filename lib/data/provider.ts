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
  User,
  StaffInvite,
  StaffMember,
  IndustryConfig,
  WorkspaceSettings,
  WhiteLabelConfig,
  Region,
  Integration,
} from "./types";

// ── Auth types ──────────────────────────────────────────────
export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  businessName: string;
  industryKey: string;
  region: Region;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: User["role"];
  workspaceId: string;
  isDemo: boolean;
}

export type RegisterResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string };

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

export interface AddCustomerInput {
  name: string;
  email?: string;
  phone?: string;
  services: string[];
  serviceConsent: boolean;
  marketingConsent: boolean;
  consentSourceText: string;
}

export interface GoogleLocationPatch {
  placeId: string;
  name?: string;
  address?: string;
  city?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
}

export interface CreateTaskInput {
  kind: GbpTask["kind"];
  title: string;
  rationale: string;
  preview: string;
  impact: GbpTask["impact"];
}

/**
 * The single data-access contract — now multi-tenant.
 * Scoped methods take the workspaceId (always resolved server-side from the
 * session, never from client input). Token/slug lookups are global because
 * tokens/slugs are unguessable identifiers used on public surfaces.
 */
export interface DataProvider {
  readonly backed: "memory" | "postgres";

  // Whole-tenant read
  getData(workspaceId: string): Promise<FoundlyData | null>;

  // Auth
  registerUser(input: RegisterInput): Promise<RegisterResult>;
  verifyCredentials(email: string, password: string): Promise<AuthUser | null>;
  getUserByEmail(email: string): Promise<AuthUser | null>;
  upsertGoogleUser(input: {
    googleSub: string;
    email: string;
    name: string;
  }): Promise<AuthUser | null>;

  // Focused reads
  getCustomer(workspaceId: string, id: CustomerId): Promise<Customer | null>;
  getRequestByToken(
    token: string,
  ): Promise<{ request: ReviewRequest; location: FoundlyData["location"] } | null>;

  // Core loop mutations
  captureCustomer(
    workspaceId: string,
    input: CaptureCustomerInput,
  ): Promise<{ customer: Customer; request: ReviewRequest }>;
  addCustomer(workspaceId: string, input: AddCustomerInput): Promise<Customer>;
  sendRequest(workspaceId: string, input: SendRequestInput): Promise<ReviewRequest>;
  advanceRequest(
    token: string,
    to: "opened" | "clicked" | "posted_google" | "private_feedback",
    meta?: { rating?: 1 | 2 | 3 | 4 | 5; attributes?: string[] },
  ): Promise<ReviewRequest | null>;
  submitPrivateFeedback(input: SubmitPrivateFeedbackInput): Promise<PrivateFeedback>;
  resolvePrivateFeedback(workspaceId: string, feedbackId: string): Promise<void>;
  recordDraft(workspaceId: string, input: RecordDraftInput): Promise<ReviewDraft>;
  approveTask(workspaceId: string, id: TaskId): Promise<GbpTask | null>;
  snoozeTask(workspaceId: string, id: TaskId): Promise<GbpTask | null>;
  createGbpTask(workspaceId: string, input: CreateTaskInput): Promise<GbpTask>;
  postReply(workspaceId: string, input: PostReplyInput): Promise<Review | null>;
  createCampaign(workspaceId: string, input: CreateCampaignInput): Promise<Campaign>;
  setCampaignStatus(
    workspaceId: string,
    campaignId: string,
    status: "active" | "paused",
  ): Promise<void>;
  updateConsent(
    workspaceId: string,
    id: CustomerId,
    consent: Partial<CustomerConsent>,
  ): Promise<Customer | null>;

  // QR
  mintRequestFromQrSlug(
    slug: string,
  ): Promise<{ token: string; business: string } | null>;

  // Workspace configuration
  updateIndustry(
    workspaceId: string,
    industryKey: string,
    config?: IndustryConfig,
  ): Promise<void>;
  updateWorkspaceSettings(
    workspaceId: string,
    patch: Partial<WorkspaceSettings>,
  ): Promise<void>;
  updateLocationGoogle(workspaceId: string, patch: GoogleLocationPatch): Promise<void>;
  updateWhiteLabel(workspaceId: string, config: WhiteLabelConfig): Promise<void>;
  setIntegrationStatus(
    workspaceId: string,
    provider: Integration["provider"],
    status: Integration["status"],
    detail: string,
  ): Promise<void>;

  // Team
  createStaffInvite(
    workspaceId: string,
    email: string,
    role: "manager" | "staff",
  ): Promise<StaffInvite | { error: string }>;
  addStaffMember(workspaceId: string, displayName: string): Promise<StaffMember>;

  // Notifications
  markNotificationsRead(workspaceId: string): Promise<void>;

  // Demo
  resetDemo(): Promise<void>;
}

export type { Customer, Review, ReviewReply };
