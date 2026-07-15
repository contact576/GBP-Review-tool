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
  stats: { sent: number; opened: number; clicked: number };
  createdAt: string;
}

// ── Billing ─────────────────────────────────────────────────
export interface Subscription {
  id: Id;
  workspaceId: WorkspaceId;
  tier: PlanTier;
  interval: "monthly" | "annual";
  status: "trialing" | "active" | "past_due" | "free" | "canceled";
  trialEndsAt?: string;
  currency: "USD" | "CAD";
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
  date: string; // ISO date
  foundYou: number;
  contactedYou: number;
  newReviews: number;
  growthScore: number;
  reviewsScore: number;
  profileScore: number;
}

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
  provider: "google" | "google_places" | "twilio" | "resend" | "stripe";
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
  rating: 1 | 2 | 3;
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
