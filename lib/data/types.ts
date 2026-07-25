/**
 * Foundly domain model.
 *
 * These types are the single source of truth for every screen, server action,
 * and the DataProvider interface. IDs are plain strings (aliased for
 * readability) to keep the large surface area friction-free across the app.
 */

// ── ID aliases ──────────────────────────────────────────────
export type Id = string;
export type WorkspaceId = Id;
export type LocationId = Id;
export type UserId = Id;
export type StaffId = Id;
export type CustomerId = Id;
export type ReviewId = Id;
export type RequestId = Id;
export type TaskId = Id;
export type CampaignId = Id;

// ── Shared enums ────────────────────────────────────────────
export type Region = "US" | "CA";
export type PlanTier =
  | "free"
  | "starter"
  | "growth"
  | "pro"
  | "multi"
  | "agency";
export type Channel = "email" | "sms" | "whatsapp";
/**
 * Industry key — resolves against lib/industries catalog (36 industries +
 * custom). Widened from the legacy 7-value union; legacy values remain valid
 * catalog keys.
 */
export type Vertical = string;

export type RequestStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "posted_google"
  | "private_feedback"
  | "suppressed"
  | "failed";

export type ReplyTone = "warm" | "professional" | "brief";
export type Durability = "stable" | "at_risk" | "vanished";
export type TaskKind = "post" | "photo" | "qna" | "service" | "hours" | "reply";
export type TaskStatus = "suggested" | "approved" | "snoozed" | "done";
export type Role = "owner" | "manager" | "staff" | "agency_admin" | "platform_admin";

// ── Tenancy & identity ──────────────────────────────────────
export interface Organization {
  id: Id;
  name: string;
  legalName: string;
  region: Region;
  orgType: "direct" | "agency";
  billingEmail: string;
}

export interface IndustryConfig {
  customLabel?: string;
  customServices?: string[];
  customAttributes?: string[];
}

export interface Workspace {
  id: WorkspaceId;
  organizationId: Id;
  name: string;
  vertical: Vertical;
  industryConfig?: IndustryConfig;
  region: Region;
  timezone: string;
  plan: PlanTier;
  createdAt: string; // ISO
  isDemo?: boolean;
  whiteLabel?: WhiteLabelConfig;
  settings?: WorkspaceSettings;
  referredByWorkspaceId?: WorkspaceId;
  referralRewardStatus?: "pending" | "applied";
  referralRewardAppliedAt?: string;
}

export interface WorkspaceSettings {
  serviceConsentDefault: boolean;
  marketingOptInVisible: boolean;
  quietHours: boolean;
  leaderboardVisible: boolean;
}

export interface GbpProfileState {
  description: string;
  primaryCategory: string;
  secondaryCategories: string[];
  photoCount: number;
  postCount: number;
  qnaCount: number;
  hoursSet: boolean;
  holidayHoursSet: boolean;
  servicesWithDescriptions: number;
  servicesTotal: number;
  responseRate: number; // 0..1
  completeness: number; // 0..100
}

export type GbpCapabilityStatus =
  | "complete"
  | "partial"
  | "missing"
  | "unknown"
  | "not_applicable";

export interface GbpBusinessCategory {
  name: string;
  displayName?: string;
}

export interface GbpPostalAddress {
  regionCode?: string;
  languageCode?: string;
  postalCode?: string;
  administrativeArea?: string;
  locality?: string;
  sublocality?: string;
  addressLines?: string[];
}

export interface GbpServiceItem {
  name?: string;
  description?: string;
  categoryName?: string;
  serviceTypeId?: string;
  price?: { currencyCode?: string; units?: string; nanos?: number };
  source: "structured" | "free_form" | "unknown";
}

export interface GbpAttributeValue {
  name: string;
  displayName?: string;
  valueType?: string;
  values?: unknown[];
  setValues?: string[];
  unsetValues?: string[];
  uriValues?: Array<{ uri: string }>;
}

export interface GbpMediaItem {
  /** Stable Google resource name. Persist this rather than treating a URL as identity. */
  name: string;
  mediaFormat?: string;
  category?: string;
  priceListItemId?: string;
  /** Google-hosted original. Google documents this URL as non-static; refresh on every sync. */
  googleUrl?: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  createTime?: string;
  description?: string;
  widthPixels?: number;
  heightPixels?: number;
  viewCount?: string;
  attribution?: {
    profileName?: string;
    profilePhotoUrl?: string;
    profileUrl?: string;
    displayName?: string;
  };
}

export interface GbpLocalPost {
  name: string;
  summary?: string;
  languageCode?: string;
  topicType?: string;
  state?: string;
  createTime?: string;
  updateTime?: string;
  searchUrl?: string;
  callToAction?: { actionType?: string; url?: string };
  media?: GbpMediaItem[];
}

export interface GbpQuestion {
  name: string;
  text?: string;
  authorName?: string;
  createTime?: string;
  updateTime?: string;
  upvoteCount?: number;
  totalAnswerCount?: number;
  topAnswers?: Array<{
    name?: string;
    text?: string;
    authorName?: string;
    upvoteCount?: number;
    createTime?: string;
    updateTime?: string;
  }>;
}

export interface GbpSearchKeyword {
  keyword: string;
  impressions?: number;
  threshold?: number;
}

export type ExternalEvidenceStatus =
  | "synced"
  | "not_connected"
  | "not_authorized"
  | "unavailable"
  | "error";

export interface WebsitePageEvidence {
  url: string;
  title?: string;
  description?: string;
  headings: string[];
  textSample: string;
  images: Array<{ url: string; alt?: string }>;
}

export interface WebsiteEvidenceSnapshot {
  status: ExternalEvidenceStatus;
  observedAt: string;
  requestedUrl?: string;
  finalUrl?: string;
  pages: WebsitePageEvidence[];
  facts: {
    businessNames: string[];
    phones: string[];
    emails: string[];
    addresses: string[];
    services: string[];
    socialProfiles: string[];
  };
  error?: string;
}

export interface SearchConsoleEvidenceSnapshot {
  status: ExternalEvidenceStatus;
  observedAt: string;
  siteUrl?: string;
  rows: Array<{
    query: string;
    page?: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  error?: string;
}

export interface InstagramEvidenceSnapshot {
  status: ExternalEvidenceStatus;
  observedAt: string;
  accountId?: string;
  username?: string;
  name?: string;
  biography?: string;
  website?: string;
  followersCount?: number;
  media: Array<{
    id: string;
    caption?: string;
    mediaType?: string;
    mediaUrl?: string;
    permalink?: string;
    timestamp?: string;
  }>;
  error?: string;
}

export interface ExternalEvidenceBundle {
  website: WebsiteEvidenceSnapshot;
  searchConsole: SearchConsoleEvidenceSnapshot;
  instagram: InstagramEvidenceSnapshot;
}

export interface GbpLocationRecord {
  name: string;
  title?: string;
  languageCode?: string;
  storeCode?: string;
  websiteUri?: string;
  phoneNumbers?: { primaryPhone?: string; additionalPhones?: string[] };
  storefrontAddress?: GbpPostalAddress;
  serviceArea?: unknown;
  categories?: {
    primaryCategory?: GbpBusinessCategory;
    additionalCategories?: GbpBusinessCategory[];
  };
  regularHours?: unknown;
  specialHours?: unknown;
  moreHours?: unknown[];
  openInfo?: unknown;
  profile?: { description?: string };
  labels?: string[];
  latlng?: { latitude?: number; longitude?: number };
  metadata?: {
    placeId?: string;
    mapsUri?: string;
    newReviewUri?: string;
    hasVoiceOfMerchant?: boolean;
    canDelete?: boolean;
    canModifyServiceList?: boolean;
    canHaveFoodMenus?: boolean;
    canOperateHealthData?: boolean;
    canHaveBusinessCalls?: boolean;
    [key: string]: unknown;
  };
  relationshipData?: unknown;
  serviceItems?: GbpServiceItem[];
}

export interface GbpProfileSnapshot {
  schemaVersion: 1;
  source: "google_business_profile";
  accountResource: string;
  locationResource: string;
  syncedAt: string;
  location: GbpLocationRecord;
  attributes: GbpAttributeValue[];
  availableAttributes: GbpAttributeValue[];
  media: GbpMediaItem[];
  localPosts: GbpLocalPost[];
  questions: GbpQuestion[];
  searchKeywords: GbpSearchKeyword[];
  externalEvidence?: ExternalEvidenceBundle;
  googleUpdated?: {
    diffMask: string[];
    pendingMask: string[];
    location?: GbpLocationRecord;
  };
  capabilities: Array<{
    key: string;
    label: string;
    status: GbpCapabilityStatus;
    weight: number;
    evidence: string;
  }>;
  capabilityScore: {
    score: number;
    applicableCount: number;
    completeCount: number;
    partialCount: number;
    missingCount: number;
    unknownCount: number;
    excludedCount: number;
  };
  reviewResponseRate: number;
  sourceStatus: Record<
    "location" | "attributes" | "attributeMetadata" | "media" | "posts" | "questions" | "reviews" | "performance" | "searchKeywords" | "googleUpdates",
    "synced" | "unavailable" | "not_authorized" | "error"
  >;
  warnings: string[];
}

export type AuditEvidenceSource =
  | "google_profile"
  | "google_reviews"
  | "google_media"
  | "google_posts"
  | "google_qna"
  | "google_performance"
  | "google_search_keywords"
  | "google_pending_update"
  | "website"
  | "instagram"
  | "search_console"
  | "owner";

export interface AuditEvidenceFact {
  id: string;
  source: AuditEvidenceSource;
  field: string;
  value: unknown;
  observedAt: string;
  confidence: number;
  authoritative: boolean;
  sourceRef?: string;
}

export interface AuditEvidenceConflict {
  id: string;
  field: string;
  evidenceIds: string[];
  status: "needs_owner_confirmation" | "google_pending" | "resolved";
  explanation: string;
}

export type AuditFindingTarget =
  | "business_title"
  | "primary_category"
  | "additional_categories"
  | "address"
  | "service_area"
  | "phone"
  | "website"
  | "description"
  | "hours"
  | "special_hours"
  | "services"
  | "attributes"
  | "action_links"
  | "media"
  | "local_post"
  | "owner_reply"
  | "qna_answer"
  | "keyword_coverage"
  | "source_connection";

export interface LocalGrowthAuditFinding {
  id: string;
  target: AuditFindingTarget;
  title: string;
  rationale: string;
  evidenceIds: string[];
  status: "open" | "blocked" | "resolved" | "dismissed";
  severity: "low" | "medium" | "high" | "critical";
  priorityScore: number;
  confidence: number;
  expectedImpact: "profile" | "discovery" | "conversion" | "trust";
  currentValue?: unknown;
  suggestedValue?: unknown;
  requiresOwnerFacts: boolean;
  blockers: string[];
  createdAt: string;
}

export interface LocalGrowthAudit {
  id: string;
  schemaVersion: 1;
  workspaceId: string;
  locationId: string;
  generatedAt: string;
  profileSnapshotAt: string;
  applicableProfileScore: number;
  summary: {
    openFindings: number;
    criticalFindings: number;
    blockedFindings: number;
    conflicts: number;
    evidenceFacts: number;
  };
  sourceCoverage: Record<
    "google_profile" | "google_reviews" | "google_media" | "google_posts" | "google_qna" | "google_search_keywords" | "website" | "instagram" | "search_console",
    "connected" | "partial" | "not_connected" | "unavailable" | "error"
  >;
  evidence: AuditEvidenceFact[];
  conflicts: AuditEvidenceConflict[];
  findings: LocalGrowthAuditFinding[];
}

export type ProfileSuggestionStatus =
  | "needs_connection"
  | "needs_evidence"
  | "needs_facts"
  | "needs_asset"
  | "needs_generation"
  | "ready_for_review"
  | "approved"
  | "queued"
  | "executing"
  | "verification_pending"
  | "applied"
  | "failed"
  | "dismissed";

export interface ProfileSuggestion {
  id: string;
  workspaceId: string;
  locationId: string;
  auditId: string;
  findingId: string;
  target: AuditFindingTarget;
  kind: "profile_edit" | "local_post" | "media" | "owner_reply" | "qna" | "research" | "connection";
  title: string;
  rationale: string;
  priorityScore: number;
  risk: "low" | "medium" | "high";
  status: ProfileSuggestionStatus;
  currentValue?: unknown;
  proposedValue?: unknown;
  exactPreviewReady: boolean;
  evidenceIds: string[];
  blockers: string[];
  nextStep: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  factsConfirmedAt?: string;
  factsConfirmedBy?: string;
}

export interface ProfileMutationJob {
  id: string;
  workspaceId: string;
  locationId: string;
  suggestionId: string;
  idempotencyKey: string;
  target: AuditFindingTarget;
  status:
    | "queued"
    | "executing"
    | "verification_pending"
    | "applied"
    | "failed"
    | "rolled_back";
  updateMask: string[];
  beforeValue?: unknown;
  proposedValue: unknown;
  providerResponse?: unknown;
  verifiedValue?: unknown;
  rollbackValue?: unknown;
  attempts: number;
  approvedAt: string;
  approvedBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  appliedAt?: string;
  failedAt?: string;
  lastError?: string;
}

/** Durable ledger for one owner-approved Google content publication. */
export interface ContentPublishingJob {
  id: string;
  workspaceId: string;
  locationId: string;
  suggestionId: string;
  assetId?: string;
  idempotencyKey: string;
  kind: "local_post" | "owner_reply" | "qna";
  status: "queued" | "executing" | "verification_pending" | "published" | "failed" | "rejected";
  exactPayload: unknown;
  providerResponse?: unknown;
  providerResourceName?: string;
  verifiedValue?: unknown;
  attempts: number;
  approvedAt: string;
  approvedBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  publishedAt?: string;
  failedAt?: string;
  lastError?: string;
}

/** One idempotent read-only monitoring pass for a connected workspace/window. */
export interface MonitoringRun {
  id: string;
  workspaceId: string;
  windowKey: string;
  trigger: "scheduled" | "manual";
  status: "running" | "completed" | "partial" | "failed" | "skipped";
  attempts: number;
  summary?: Record<string, string | number | boolean | string[]>;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  lastError?: string;
}

/**
 * A generated asset is stored separately from the suggestion JSON so large
 * image payloads never bloat the Google profile snapshot or approval inbox.
 * Access is always workspace-scoped and served through an authenticated route.
 */
export interface AiContentAsset {
  id: string;
  workspaceId: string;
  locationId: string;
  suggestionId: string;
  kind: "image";
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  base64Data: string;
  prompt: string;
  altText: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: LocationId;
  workspaceId: WorkspaceId;
  name: string;
  category: string;
  vertical: Vertical;
  address: string;
  city: string;
  region: Region;
  timezone: string;
  googlePlaceId?: string;
  reviewUrl: string; // Google "write a review" deep link
  rating: number;
  reviewCount: number;
  joinedAt: string; // ISO — anchors "since you joined"
  profile: GbpProfileState;
  gbpConnected: boolean;
  /** Latest owned-profile read snapshot. Optional for unconnected and legacy workspaces. */
  gbpSnapshot?: GbpProfileSnapshot;
  /** Latest deterministic audit derived from the persisted evidence snapshot. */
  gbpAudit?: LocalGrowthAudit;
  /** Ranked, approval-gated actions derived from the latest audit. */
  suggestionInbox?: ProfileSuggestion[];
}

export interface User {
  id: UserId;
  email: string;
  name: string;
  role: Role;
  workspaceId: WorkspaceId;
  twoFactorEnabled: boolean;
  avatarInitials: string;
  passwordHash?: string;
  emailVerified?: boolean;
  googleSub?: string;
}

export interface StaffInvite {
  id: Id;
  workspaceId: WorkspaceId;
  email: string;
  role: "manager" | "staff";
  token: string;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
}

export interface StaffMember {
  id: StaffId;
  locationId: LocationId;
  displayName: string;
  role: "manager" | "staff";
  qrToken: string;
  active: boolean;
  streakDays: number;
  captures: number;
  detectedReviews: number;
  lastActiveAt?: string;
  avatarInitials: string;
}

// ── Customers & consent (dual flags) ────────────────────────
export interface CustomerConsent {
  serviceConsent: boolean;
  serviceConsentAt?: string;
  marketingConsent: boolean;
  marketingConsentAt?: string;
  consentChannel: "in_person" | "web" | "import";
  consentSourceText: string;
  caslCaptured: boolean;
  withdrawnAt?: string;
}

export type LifecycleStage =
  | "new"
  | "requested"
  | "opened"
  | "reviewed"
  | "suppressed";

export interface Customer {
  id: CustomerId;
  locationId: LocationId;
  name: string;
  email?: string;
  phone?: string;
  createdAt: string;
  source: "staff" | "import" | "campaign" | "walk_in";
  staffId?: StaffId;
  visitCount: number;
  lastVisitAt?: string;
  lastRequestAt?: string;
  services: string[];
  sentiment?: "happy" | "unhappy" | "neutral";
  lifecycleStage: LifecycleStage;
  consent: CustomerConsent;
  suppressedReason?: string;
  tags: string[];
}

// ── Requests / reviews / drafts / matching ──────────────────
export interface DraftVariant {
  text: string;
  tone: string; // "Warm" | "Short & punchy" | "Detailed"
}

export interface ReviewRequest {
  id: RequestId;
  locationId: LocationId;
  customerId: CustomerId;
  customerName: string;
  staffId?: StaffId;
  channel: Channel;
  token: string;
  status: RequestStatus;
  isTest: boolean;
  createdAt: string;
  sentAt?: string;
  openedAt?: string;
  clickedAt?: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  attributes: string[];
  privateFeedback?: string;
  suppressedReason?: string;
}

export interface Review {
  id: ReviewId;
  locationId: LocationId;
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  publishedAt: string;
  source: "google";
  durability: Durability;
  vanishedAt?: string;
  reply?: ReviewReply;
  matchedRequestId?: string;
  matchConfidence?: number;
  needsReply: boolean;
}

export interface ReviewReply {
  id: Id;
  text: string;
  tone: ReplyTone;
  source: "ai" | "human";
  postedAt: string;
  approvedBy: string;
}

export interface ReviewDraft {
  id: Id;
  requestId?: RequestId;
  reviewId?: ReviewId;
  kind: "review" | "reply";
  variants: DraftVariant[];
  approvedVariantIndex?: number;
  generatedBy: "ai" | "template";
  createdAt: string;
}

// ── GBP Co-Pilot ────────────────────────────────────────────
export interface GbpTask {
  id: TaskId;
  locationId: LocationId;
  isoWeek: string;
  kind: TaskKind;
  title: string;
  rationale: string;
  preview: string;
  status: TaskStatus;
  impact: "reviews" | "profile";
  effortMins: number;
  createdAt: string;
}

// ── Campaigns ───────────────────────────────────────────────
export type CampaignType = "promo" | "winback" | "reminder" | "festival";

/** What happened to one snapshotted recipient. `pending` = not attempted yet. */
export type CampaignRecipientOutcome =
  | "pending"
  | "sent"
  | "failed"
  | "skipped"
  | "held";

export interface CampaignRecipient {
  customerId: CustomerId;
  name: string;
  channel: Channel;
  /**
   * The real destination the message goes to. Stored (not masked) because the
   * snapshot IS the send list — a scheduled campaign drains from it hours
   * later and must not re-derive the audience. Surfaces mask it for display.
   */
  destination: string;
  outcome: CampaignRecipientOutcome;
  /** Plain-language reason for any outcome that is not `sent`. */
  detail?: string;
  /** Resend/Twilio message id, when the provider accepted the message. */
  providerId?: string;
  attemptedAt?: string;
}

/**
 * The audience frozen at the moment a send is committed.
 *
 * WHY IMMUTABLE: consent is a point-in-time legal fact. If a customer opts out
 * tomorrow, the record of who we were permitted to contact today must not
 * silently change — otherwise the delivery log stops being evidence. Counts and
 * the recipient list are written once; only per-recipient `outcome` is filled
 * in as delivery proceeds.
 *
 * A withdrawal between snapshot and send is still honoured: the drain re-checks
 * live consent and marks that recipient `skipped`, leaving the snapshot intact.
 */
export interface CampaignAudienceSnapshot {
  takenAt: string;
  consentBasis: "service" | "marketing";
  channel: Channel;
  /** Everyone considered, before any filtering. */
  total: number;
  /** Size of `recipients` — who this snapshot permits contacting. */
  eligible: number;
  excluded: { reason: string; count: number }[];
  recipients: CampaignRecipient[];
}

export type CampaignDeliveryState =
  /** Provider keys absent — nothing was sent, and we say so. */
  | "not_configured"
  /** A compliance or quota gate refused the send. */
  | "blocked"
  /** Outside the recipient's local sending window. */
  | "held"
  /** Committed for a future time; the cron drains it. */
  | "scheduled"
  | "delivered"
  | "partial";

export interface CampaignDelivery {
  state: CampaignDeliveryState;
  /** Owner-facing sentence: what happened and what to do about it. */
  note: string;
  /** Env vars / connections missing when `state === "not_configured"`. */
  missing?: string[];
  attemptedAt?: string;
  snapshot?: CampaignAudienceSnapshot;
  /** SMS credits this campaign actually consumed. */
  creditsUsed?: number;
}

export interface CampaignStats {
  sent: number;
  opened: number;
  clicked: number;
  /** Real outcome counters from the delivery pipeline (absent = never sent). */
  failed?: number;
  skipped?: number;
  held?: number;
  /**
   * STORAGE DETAIL: the delivery record rides inside this jsonb blob in
   * Postgres so the `campaign` table needs no migration. Providers lift it
   * onto `Campaign.delivery` on read and fold it back in on write — read
   * `Campaign.delivery`, never this.
   */
  delivery?: CampaignDelivery;
}

export interface Campaign {
  id: CampaignId;
  locationId: LocationId;
  name: string;
  type: CampaignType;
  isAutomation: boolean;
  consentBasis: "service" | "marketing";
  channel: Channel;
  subject?: string;
  body: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "active" | "paused";
  scheduledAt?: string;
  audienceTotal: number;
  audienceConsented: number;
  excluded: { reason: string; count: number }[];
  stats: CampaignStats;
  /** Frozen audience + per-recipient outcomes of the last committed send. */
  delivery?: CampaignDelivery;
  createdAt: string;
}

// ── Billing ─────────────────────────────────────────────────
export interface Subscription {
  id: Id;
  workspaceId: WorkspaceId;
  tier: PlanTier;
  interval: "monthly" | "annual";
  status: "trialing" | "active" | "past_due" | "free" | "canceled" | "paused";
  trialEndsAt?: string;
  currency: "USD" | "CAD";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  usage: {
    aiDraftsUsed: number;
    aiDraftsLimit: number; // -1 = unlimited
    smsCreditsUsed: number;
    smsCreditsTotal: number;
    requestsSent: number;
    reviewsCaptured: number;
  };
}

export interface Invoice {
  id: Id;
  workspaceId: WorkspaceId;
  amount: number;
  currency: "USD" | "CAD";
  status: "paid" | "open" | "void";
  period: string;
  issuedAt: string;
}

// ── Benchmark / analytics / visibility / rank ───────────────
export interface BenchmarkCompetitor {
  id: Id;
  locationId: LocationId;
  name: string;
  rating: number;
  reviewCount: number;
  velocity30d: number;
  isYou?: boolean;
}

export interface MetricSnapshot {
  locationId: LocationId;
  date: string; // ISO date when this rolling observation was captured
  /** Current product snapshots represent a rolling 30-day window. */
  window?: "rolling_30d";
  /** Per-field provenance prevents zeros from masquerading as connected data. */
  sources?: {
    foundYou?: MetricSource;
    contactedYou?: MetricSource;
    newReviews?: MetricSource;
    scores?: MetricSource;
  };
  foundYou: number;
  contactedYou: number;
  newReviews: number;
  growthScore: number;
  reviewsScore: number;
  profileScore: number;
}

export type MetricSource =
  | "demo"
  | "google_places"
  | "gbp_reviews"
  | "gbp_performance"
  | "foundly_requests";

export interface AeoQueryResult {
  query: string;
  named: boolean;
  position: number | null;
  competitorsNamed: string[];
  answerExcerpt: string;
}

export interface AeoSnapshot {
  locationId: LocationId;
  date: string;
  namedFraction: { named: number; total: number };
  queries: AeoQueryResult[];
}

export interface RankGridPoint {
  row: number;
  col: number;
  rank: number | null;
  latitude?: number;
  longitude?: number;
}

export interface RankGridScan {
  id: Id;
  locationId: LocationId;
  keyword: string;
  gridSize: number;
  avgRank: number;
  shareOfLocalPack: number;
  points: RankGridPoint[];
  ranAt: string;
  source?: "google_places";
  radiusKm?: number;
}

// ── Studio / assets / milestones ────────────────────────────
export interface QrAsset {
  id: Id;
  locationId: LocationId;
  scope: "location" | "staff";
  staffId?: StaffId;
  label: string;
  slug: string;
  targetUrl: string;
  scans: number;
  pageOpens: number;
  degraded: boolean;
}

export interface Widget {
  id: Id;
  locationId: LocationId;
  kind: "badge" | "carousel" | "button";
  domain: string;
  impressions: number;
  clicks: number;
}

export type MilestoneKind =
  | "reviews_25"
  | "reviews_50"
  | "reviews_100"
  | "rating_4_8"
  | "velocity_2x"
  | "streak_10";

export interface Milestone {
  id: Id;
  locationId: LocationId;
  kind: MilestoneKind;
  title: string;
  subtitle: string;
  achievedAt: string;
  shared: boolean;
}

// ── Agency / white-label ────────────────────────────────────
export interface WhiteLabelConfig {
  brandName: string;
  primary: string;
  primaryDark: string;
  accent: string;
  logoText: string;
  domain?: string;
  contrastValid: boolean;
}

export interface AgencyClient {
  locationId: LocationId;
  name: string;
  city: string;
  contactEmail?: string;
  growthScore: number;
  rating: number;
  newReviews30d: number;
  needsReply: number;
  plan: PlanTier;
  lastReportSent?: string;
  status: "healthy" | "attention" | "at_risk";
}

export interface Agency {
  id: Id;
  organizationId: Id;
  name: string;
  clients: AgencyClient[];
  wholesaleRate: number;
  retailAverage: number;
  whiteLabel: WhiteLabelConfig;
}

// ── Platform / admin ────────────────────────────────────────
export interface SuppressionEntry {
  id: Id;
  locationId: LocationId;
  matchType: "email" | "phone" | "domain";
  value: string;
  reason: string;
  addedAt: string;
}

export interface Integration {
  id: Id;
  locationId: LocationId;
  provider: "google" | "google_places" | "website" | "search_console" | "instagram" | "twilio" | "resend" | "stripe";
  label: string;
  status: "connected" | "pending" | "disconnected" | "needs_attention";
  detail: string;
  lastSyncAt?: string;
}

export interface AuditLog {
  id: Id;
  workspaceId: WorkspaceId;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  at: string;
  meta?: Record<string, string | number | boolean>;
}

export interface FeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
  rollout: "all" | "beta" | "internal";
}

export interface Notification {
  id: Id;
  locationId: LocationId;
  kind: "review" | "feedback" | "delivery" | "milestone" | "system";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export interface PrivateFeedback {
  id: Id;
  locationId: LocationId;
  customerName: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  createdAt: string;
  resolved: boolean;
}

export interface GrowthReport {
  id: Id;
  locationId: LocationId;
  period: string;
  headline: string;
  narrative: string;
  generatedAt: string;
}

// ── Admin platform KPIs (aggregate, seeded) ─────────────────
export interface PlatformTenant {
  id: Id;
  name: string;
  vertical: Vertical;
  plan: PlanTier;
  mrr: number;
  locations: number;
  status: "trialing" | "active" | "past_due" | "free";
  region: Region;
}

export interface DeliveryIncident {
  id: Id;
  tenant: string;
  channel: Channel;
  type: string;
  severity: "low" | "medium" | "high";
  count: number;
  at: string;
}

export interface FraudFlag {
  id: Id;
  tenant: string;
  kind: "same_device" | "staff_self_review" | "velocity_anomaly";
  detail: string;
  severity: "low" | "medium" | "high";
  at: string;
}

export interface DurabilityRecord {
  id: Id;
  tenant: string;
  posted: number;
  survived30d: number;
  survived60d: number;
  vanished: number;
  filteredRate: number;
}

// ── The whole seeded dataset shape ──────────────────────────
export interface FoundlyData {
  organization: Organization;
  workspace: Workspace;
  location: Location;
  owner: User;
  invites: StaffInvite[];
  staff: StaffMember[];
  customers: Customer[];
  requests: ReviewRequest[];
  reviews: Review[];
  drafts: ReviewDraft[];
  tasks: GbpTask[];
  mutationJobs: ProfileMutationJob[];
  campaigns: Campaign[];
  subscription: Subscription;
  invoices: Invoice[];
  competitors: BenchmarkCompetitor[];
  metrics: MetricSnapshot[];
  aeo: AeoSnapshot;
  rankScans: RankGridScan[];
  qrAssets: QrAsset[];
  widgets: Widget[];
  milestones: Milestone[];
  suppression: SuppressionEntry[];
  integrations: Integration[];
  auditLog: AuditLog[];
  featureFlags: FeatureFlag[];
  notifications: Notification[];
  privateFeedback: PrivateFeedback[];
  reports: GrowthReport[];
  agency: Agency;
  platform: {
    tenants: PlatformTenant[];
    deliveryIncidents: DeliveryIncident[];
    fraudFlags: FraudFlag[];
    durability: DurabilityRecord[];
    kpis: {
      totalTenants: number;
      activeLocations: number;
      mrr: number;
      trialConversion: number;
      logoChurn: number;
      nrr: number;
      weeklyDetectedReviews: number;
    };
  };
}
