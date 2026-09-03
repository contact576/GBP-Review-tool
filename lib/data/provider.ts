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
  CampaignDelivery,
  CampaignStats,
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
  Subscription,
  TrialNotices,
  RankGridScan,
  AeoSnapshot,
  AgencyClient,
  ProfileSuggestion,
  ProfileMutationJob,
  ContentPublishingJob,
  MonitoringRun,
  AiContentAsset,
  AuditLog,
  Milestone,
  Notification,
  BusinessDetailsPatch,
  FraudTriage,
  PlatformAuditEntry,
  PlatformHistoryRecord,
  PlatformTenantDetail,
  PlatformTenantUser,
} from "./types";

export type ProfileSuggestionPatch = Partial<
  Pick<
    ProfileSuggestion,
    | "status"
    | "proposedValue"
    | "exactPreviewReady"
    | "blockers"
    | "nextStep"
    | "updatedAt"
    | "approvedAt"
    | "approvedBy"
    | "factsConfirmedAt"
    | "factsConfirmedBy"
  >
>;

export type ProfileMutationJobPatch = Partial<
  Pick<
    ProfileMutationJob,
    | "status"
    | "beforeValue"
    | "providerResponse"
    | "verifiedValue"
    | "rollbackValue"
    | "attempts"
    | "updatedAt"
    | "startedAt"
    | "appliedAt"
    | "failedAt"
    | "lastError"
  >
>;

export type ContentPublishingJobPatch = Partial<
  Pick<
    ContentPublishingJob,
    | "status"
    | "providerResponse"
    | "providerResourceName"
    | "verifiedValue"
    | "attempts"
    | "updatedAt"
    | "startedAt"
    | "publishedAt"
    | "failedAt"
    | "lastError"
  >
>;

export type MonitoringRunPatch = Partial<
  Pick<MonitoringRun, "status" | "attempts" | "summary" | "updatedAt" | "completedAt" | "lastError">
>;

// ── Auth types ──────────────────────────────────────────────
export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  businessName: string;
  industryKey: string;
  region: Region;
  referredByWorkspaceId?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: User["role"];
  workspaceId: string;
  isDemo: boolean;
  /** Monotonic counter embedded in the session JWT; bumping it revokes every
   * outstanding session for the user (V8). Absent → treated as 0. */
  sessionVersion?: number;
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

/**
 * One write of everything a delivery attempt produced.
 *
 * It is a single call rather than several because the outcome counters, the
 * frozen audience and the SMS credits consumed all describe the same event —
 * splitting them would let a crash leave a campaign that says it sent 40
 * messages while the plan shows zero credits spent.
 */
export interface CampaignDeliveryPatch {
  status?: Campaign["status"];
  /** `null` clears a schedule (used when a scheduled send is drained). */
  scheduledAt?: string | null;
  stats?: Partial<CampaignStats>;
  delivery?: CampaignDelivery;
  audienceTotal?: number;
  audienceConsented?: number;
  excluded?: Campaign["excluded"];
  /** SMS credits actually consumed, added to `subscription.usage`. */
  consumeSmsCredits?: number;
}

/** A scheduled campaign whose time has come, with the tenant it belongs to. */
export interface DueCampaign {
  workspaceId: string;
  campaign: Campaign;
}

export interface SubmitPrivateFeedbackInput {
  token: string;
  rating: 1 | 2 | 3 | 4 | 5;
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

// ── Google data sync ────────────────────────────────────────
export interface GoogleSyncResult {
  ok: boolean;
  /** Aggregate star rating (all Google reviews). */
  rating?: number;
  /** Total Google review count (complete, not the sample size). */
  reviewCount?: number;
  /** How many sample reviews were stored (≤5 for public; full for GBP). */
  reviewsImported?: number;
  /** True when the deeper Business Profile sync is waiting on Google's API approval. */
  pendingApproval?: boolean;
  /** Applicable Google profile completion, excluding unsupported capabilities. */
  capabilityScore?: number;
  /** Number of original Google-hosted media records refreshed in this sync. */
  mediaImported?: number;
  /** Optional-source failures that did not invalidate the core profile sync. */
  warnings?: string[];
  auditFindings?: number;
  suggestionsCreated?: number;
  error?: string;
}

export interface SaveGoogleCredentialInput {
  /** AES-256-GCM envelope of the OAuth refresh token — never plaintext. */
  encryptedRefreshToken: string;
  /** GBP account resource name once known, e.g. "accounts/123". */
  googleAccount?: string;
  scopes: string;
}

export interface GoogleCredential {
  workspaceId: string;
  encryptedRefreshToken: string;
  googleAccount?: string;
  scopes: string;
  connectedAt: string;
  updatedAt: string;
}

export interface InstagramCredential {
  workspaceId: string;
  encryptedAccessToken: string;
  accountId: string;
  username?: string;
  scopes: string;
  expiresAt?: string;
  connectedAt: string;
  updatedAt: string;
}

export interface SaveInstagramCredentialInput {
  encryptedAccessToken: string;
  accountId: string;
  username?: string;
  scopes: string;
  expiresAt?: string;
}

export interface PasswordResetRecord {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

export interface OrganizationWorkspaceSummary {
  workspaceId: string;
  locationId: string;
  name: string;
  city: string;
  rating: number;
  reviewCount: number;
  growthScore: number | null;
}

export interface CreateOrganizationWorkspaceInput {
  businessName: string;
  industryKey: string;
  category: string;
  region: Region;
  city?: string;
  address?: string;
  contactEmail?: string;
}

export interface ReferralSummary {
  signedUp: number;
  qualified: number;
  creditsApplied: number;
  pendingCredits: number;
}

export interface PendingReferralReward {
  referredWorkspaceId: string;
  referrerWorkspaceId: string;
  stripeCustomerId: string;
  currency: "USD" | "CAD";
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
  listOrganizationWorkspaces(workspaceId: string): Promise<OrganizationWorkspaceSummary[]>;
  listAgencyClients(workspaceId: string): Promise<AgencyClient[]>;
  /**
   * Platform-wide roster and KPIs for the ops console. The DB provider
   * computes it across every real tenant; the memory provider returns the
   * demo fixture stored on the caller's workspace.
   */
  getPlatformSnapshot(workspaceId: string): Promise<FoundlyData["platform"]>;

  // ── Platform ops (internal console) ───────────────────────
  /** One tenant (organization) in full: workspaces, users, subscription, recent audit. */
  getTenantDetail(organizationId: string): Promise<PlatformTenantDetail | null>;
  /** Newest-first audit entries across every real tenant, with the tenant named. */
  listPlatformAuditLog(limit: number): Promise<PlatformAuditEntry[]>;
  /** Users on one workspace, with whether each can actually sign in. */
  listWorkspaceUsers(workspaceId: string): Promise<PlatformTenantUser[]>;
  /** Store (or replace) the daily platform history record for its day. */
  savePlatformHistory(record: PlatformHistoryRecord): Promise<void>;
  /** Stored daily history, oldest first. */
  listPlatformHistory(limit?: number): Promise<PlatformHistoryRecord[]>;
  /** Record an operator's decision on a fraud flag (replaces any earlier one). */
  saveFraudTriage(entry: FraudTriage): Promise<void>;
  /**
   * Delete one workspace and every row that belongs to it. Refuses the demo
   * workspace and any workspace holding a platform_admin. Returns the ids of
   * the users removed so the caller can revoke their sessions.
   */
  deleteWorkspace(workspaceId: string): Promise<{ ok: true; userIds: string[] } | { ok: false; error: string }>;
  /** Delete an organization: every workspace in it, then the organization row. */
  deleteOrganization(organizationId: string): Promise<{ ok: true; workspaceIds: string[] } | { ok: false; error: string }>;

  // ── Agency (client book) ──────────────────────────────────
  /** Save the agency's own wholesale / retail rates (the economics inputs). */
  setAgencyRates(workspaceId: string, rates: { wholesaleRate: number; retailAverage: number }): Promise<void>;
  /** Patch one client's stored book entry (contact email, invite marker). */
  updateAgencyClient(
    workspaceId: string,
    locationId: string,
    patch: Partial<Pick<AgencyClient, "contactEmail" | "invitedAt">>,
  ): Promise<AgencyClient | null>;
  /** Drop a client from the agency's book (the workspace itself is deleted separately). */
  removeAgencyClient(workspaceId: string, locationId: string): Promise<void>;
  /**
   * Point a workspace's owner account at a real person: the client's own
   * email and name. Only allowed while that account has no credentials (a
   * sibling workspace created by an agency carries an uncredentialed owner
   * row); returns the user id so an invite / password-setup token can be
   * minted for it.
   */
  setWorkspaceOwnerIdentity(
    workspaceId: string,
    identity: { email: string; name: string },
  ): Promise<{ ok: true; userId: string } | { ok: false; error: string }>;
  createOrganizationWorkspace(
    workspaceId: string,
    input: CreateOrganizationWorkspaceInput,
  ): Promise<{ ok: true; workspace: OrganizationWorkspaceSummary } | { ok: false; error: string }>;
  getReferralSummary(workspaceId: string): Promise<ReferralSummary>;
  getPendingReferralReward(referredWorkspaceId: string): Promise<PendingReferralReward | null>;
  markReferralRewardApplied(referredWorkspaceId: string, appliedAt: string): Promise<void>;

  // Auth
  registerUser(input: RegisterInput): Promise<RegisterResult>;
  verifyCredentials(email: string, password: string): Promise<AuthUser | null>;
  getUserByEmail(email: string): Promise<AuthUser | null>;
  savePasswordResetToken(input: PasswordResetRecord): Promise<void>;
  revokePasswordResetToken(tokenHash: string): Promise<void>;
  consumePasswordResetToken(
    tokenHash: string,
    passwordHash: string,
    consumedAt: string,
  ): Promise<boolean>;
  upsertGoogleUser(input: {
    googleSub: string;
    email: string;
    name: string;
    referredByWorkspaceId?: string;
  }): Promise<AuthUser | null>;
  /** Current session-version for a user, or null if the user is unknown (V8). */
  getUserSessionVersion(userId: string): Promise<number | null>;
  /** Increment a user's session-version, invalidating all existing sessions (V8). */
  bumpUserSessionVersion(userId: string): Promise<void>;
  /** Set a user's email-verified flag (V17). */
  setEmailVerified(userId: string, verified: boolean): Promise<void>;
  /** Whether the workspace owner's email is verified. Fails open (true) when the
   * owner row is unknown, so callers never hard-block on missing data (V17). */
  isWorkspaceEmailVerified(workspaceId: string): Promise<boolean>;

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
  /** Bulk import — de-duped by email; reuses addCustomer's insert semantics. */
  addCustomersBulk(
    workspaceId: string,
    inputs: AddCustomerInput[],
  ): Promise<{ added: number; skipped: number }>;
  sendRequest(workspaceId: string, input: SendRequestInput): Promise<ReviewRequest>;
  setRequestDeliveryStatus(
    workspaceId: string,
    requestId: string,
    status: "sent" | "delivered" | "failed" | "suppressed",
    reason?: string,
  ): Promise<ReviewRequest | null>;
  /** Apply a signed provider opt-out across every tenant record for this phone. */
  suppressPhoneGlobally(phone: string, reason: string): Promise<number>;
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
  /** One campaign by id, scoped to its workspace. */
  getCampaign(workspaceId: string, campaignId: string): Promise<Campaign | null>;
  /**
   * Commit a delivery attempt: status, counters, frozen audience and credit
   * consumption in one write. Returns the updated campaign, or null if it is
   * gone.
   */
  recordCampaignDelivery(
    workspaceId: string,
    campaignId: string,
    patch: CampaignDeliveryPatch,
  ): Promise<Campaign | null>;
  /**
   * Scheduled campaigns due at or before `nowIso`, across every tenant. Used
   * only by the cron drain, which has no session to scope by.
   */
  listDueCampaigns(nowIso: string, limit?: number): Promise<DueCampaign[]>;
  updateConsent(
    workspaceId: string,
    id: CustomerId,
    consent: Partial<CustomerConsent>,
  ): Promise<Customer | null>;

  // QR
  mintRequestFromQrSlug(
    slug: string,
  ): Promise<{ token: string; business: string } | null>;
  /** Resolve a public QR slug to its workspace id (read-only, no side effects). */
  getWorkspaceIdBySlug(slug: string): Promise<string | null>;

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
  saveRankGridScan(workspaceId: string, scan: RankGridScan): Promise<void>;
  /** Persist the latest AI-visibility (AEO) run for the workspace. */
  saveAeoSnapshot(workspaceId: string, snapshot: AeoSnapshot): Promise<void>;
  markAgencyReportsSent(workspaceId: string, locationIds: string[], sentAt: string): Promise<void>;
  updateWhiteLabel(workspaceId: string, config: WhiteLabelConfig): Promise<void>;

  // Feature flags (admin)
  /** Flip the matching FeatureFlag's `enabled` in the workspace's flag set. */
  setFeatureFlag(workspaceId: string, key: string, enabled: boolean): Promise<void>;

  // Billing / subscription
  /** Patch the workspace subscription's status and/or tier. */
  setSubscription(
    workspaceId: string,
    patch: Partial<
      Pick<
        Subscription,
        | "status"
        | "tier"
        | "interval"
        | "trialEndsAt"
        | "stripeCustomerId"
        | "stripeSubscriptionId"
        | "stripePriceId"
        | "currentPeriodEnd"
        | "cancelAtPeriodEnd"
      >
    >,
  ): Promise<void>;
  /**
   * Every non-demo subscription whose status is `trialing`, for the daily trial
   * notice cron. Cheap on purpose: subscription rows only, no tenant fan-out.
   */
  listTrialingSubscriptions(): Promise<Subscription[]>;
  /** Record that a trial notice went out — the cron's once-per-workspace marker. */
  markTrialNoticeSent(
    workspaceId: string,
    kind: keyof TrialNotices,
    sentAt: string,
  ): Promise<void>;

  // Google data sync
  /** Pull real public Google data (aggregate rating/count + review sample). */
  syncGooglePublic(workspaceId: string): Promise<GoogleSyncResult>;
  /** Pull owned-profile data via GBP API (no-ops honestly until approved). */
  syncGoogleProfile(workspaceId: string): Promise<GoogleSyncResult>;
  saveGoogleCredential(
    workspaceId: string,
    input: SaveGoogleCredentialInput,
  ): Promise<void>;
  getGoogleCredential(workspaceId: string): Promise<GoogleCredential | null>;
  saveInstagramCredential(workspaceId: string, input: SaveInstagramCredentialInput): Promise<void>;
  getInstagramCredential(workspaceId: string): Promise<InstagramCredential | null>;
  setIntegrationStatus(
    workspaceId: string,
    provider: Integration["provider"],
    status: Integration["status"],
    detail: string,
  ): Promise<void>;
  updateProfileSuggestion(
    workspaceId: string,
    suggestionId: string,
    patch: ProfileSuggestionPatch,
  ): Promise<ProfileSuggestion | null>;
  /**
   * Save owner-entered business facts. Google stays authoritative wherever it is
   * connected; these fill the gap for workspaces that are not.
   */
  updateBusinessDetails(workspaceId: string, patch: BusinessDetailsPatch): Promise<void>;
  /**
   * Add one suggestion to the inbox. Used by the owner-initiated content path,
   * which has no audit finding behind it — the audit builder still owns every
   * suggestion it creates during a Business Profile sync.
   */
  appendProfileSuggestion(
    workspaceId: string,
    suggestion: ProfileSuggestion,
  ): Promise<ProfileSuggestion>;
  createProfileMutationJob(
    workspaceId: string,
    job: ProfileMutationJob,
  ): Promise<{ job: ProfileMutationJob; created: boolean }>;
  updateProfileMutationJob(
    workspaceId: string,
    jobId: string,
    patch: ProfileMutationJobPatch,
  ): Promise<ProfileMutationJob | null>;
  getProfileMutationJobByIdempotency(
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<ProfileMutationJob | null>;
  createContentPublishingJob(
    workspaceId: string,
    job: ContentPublishingJob,
  ): Promise<{ job: ContentPublishingJob; created: boolean }>;
  updateContentPublishingJob(
    workspaceId: string,
    jobId: string,
    patch: ContentPublishingJobPatch,
  ): Promise<ContentPublishingJob | null>;
  getContentPublishingJobByIdempotency(
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<ContentPublishingJob | null>;
  listGoogleConnectedWorkspaceIds(): Promise<string[]>;
  createMonitoringRun(
    workspaceId: string,
    run: MonitoringRun,
  ): Promise<{ run: MonitoringRun; created: boolean }>;
  updateMonitoringRun(
    workspaceId: string,
    runId: string,
    patch: MonitoringRunPatch,
  ): Promise<MonitoringRun | null>;
  getMonitoringRunByWindow(
    workspaceId: string,
    windowKey: string,
  ): Promise<MonitoringRun | null>;
  saveAiContentAsset(workspaceId: string, asset: AiContentAsset): Promise<void>;
  getAiContentAssetById(workspaceId: string, assetId: string): Promise<AiContentAsset | null>;
  getAiContentAssetBySuggestion(workspaceId: string, suggestionId: string): Promise<AiContentAsset | null>;
  appendAuditLog(workspaceId: string, entry: AuditLog): Promise<void>;
  appendNotification(workspaceId: string, notification: Notification): Promise<void>;

  // Team
  createStaffInvite(
    workspaceId: string,
    email: string,
    role: "manager" | "staff",
  ): Promise<StaffInvite | { error: string }>;
  addStaffMember(workspaceId: string, displayName: string): Promise<StaffMember>;

  // Milestones
  /**
   * Record an earned milestone. Idempotent on id — the award pass runs on every
   * sync, so re-offering an existing milestone must not duplicate it.
   */
  appendMilestone(workspaceId: string, milestone: Milestone): Promise<void>;

  // Notifications
  markNotificationsRead(workspaceId: string): Promise<void>;
  /** Mark a single notification read. Unknown ids are a no-op, never an error. */
  markNotificationRead(workspaceId: string, notificationId: string): Promise<void>;

  // Demo
  resetDemo(): Promise<void>;
}

export type { Customer, Review, ReviewReply };
