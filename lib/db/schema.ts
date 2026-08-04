import {
  pgTable,
  text,
  integer,
  boolean,
  doublePrecision,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  WhiteLabelConfig,
  IndustryConfig,
  WorkspaceSettings,
  Subscription,
  Campaign,
  AuditLog,
  DraftVariant,
  MetricSnapshot,
  BenchmarkCompetitor,
  AeoSnapshot,
  RankGridScan,
  QrAsset,
  Widget,
  Milestone,
  SuppressionEntry,
  Integration,
  FeatureFlag,
  Invoice,
  GrowthReport,
  Agency,
  FoundlyData,
  GbpProfileSnapshot,
  LocalGrowthAudit,
  ProfileSuggestion,
  ProfileMutationJob,
  AiContentAsset,
} from "../data/types";

/**
 * Foundly Postgres schema (Drizzle).
 *
 * The core review loop is modelled relationally with real columns. Every row
 * carries a denormalized `workspace_id` (and business rows a `location_id`) so
 * row-level-security policies can scope by tenant without joins.
 *
 * IDs are text (the app uses string ids like "cus_0"). Timestamps are stored as
 * text ISO strings to match the domain types exactly. `seq` is an internal
 * ordering key (never surfaced in the domain shape): seed rows get ascending
 * positive values so their array order is preserved; mutations insert with a
 * negative value (`-Date.now()`) so the newest lands at the front — mirroring
 * the in-memory provider's `unshift`.
 *
 * Largely-analytical aggregate blocks that v1 never queries relationally live
 * as typed JSONB columns on a single `dataset_meta` row keyed by workspace_id.
 */

// ── Tenancy & identity ──────────────────────────────────────
export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  legalName: text("legal_name").notNull(),
  region: text("region").notNull(),
  orgType: text("org_type").notNull(),
  billingEmail: text("billing_email").notNull(),
});

export const workspace = pgTable("workspace", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  vertical: text("vertical").notNull(),
  region: text("region").notNull(),
  timezone: text("timezone").notNull(),
  plan: text("plan").notNull(),
  createdAt: text("created_at").notNull(),
  whiteLabel: jsonb("white_label").$type<WhiteLabelConfig>(),
  industryConfig: jsonb("industry_config").$type<IndustryConfig | null>(),
  settings: jsonb("settings").$type<WorkspaceSettings | null>(),
  isDemo: boolean("is_demo").notNull().default(false),
  referredByWorkspaceId: text("referred_by_workspace_id"),
  referralRewardStatus: text("referral_reward_status"),
  referralRewardAppliedAt: text("referral_reward_applied_at"),
});

export const location = pgTable("location", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  vertical: text("vertical").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  region: text("region").notNull(),
  timezone: text("timezone").notNull(),
  googlePlaceId: text("google_place_id"),
  reviewUrl: text("review_url").notNull(),
  rating: doublePrecision("rating").notNull(),
  reviewCount: integer("review_count").notNull(),
  joinedAt: text("joined_at").notNull(),
  gbpConnected: boolean("gbp_connected").notNull(),
  // GbpProfileState (flattened)
  profileDescription: text("profile_description").notNull(),
  profilePrimaryCategory: text("profile_primary_category").notNull(),
  profileSecondaryCategories: jsonb("profile_secondary_categories")
    .$type<string[]>()
    .notNull(),
  profilePhotoCount: integer("profile_photo_count").notNull(),
  profilePostCount: integer("profile_post_count").notNull(),
  profileQnaCount: integer("profile_qna_count").notNull(),
  profileHoursSet: boolean("profile_hours_set").notNull(),
  profileHolidayHoursSet: boolean("profile_holiday_hours_set").notNull(),
  profileServicesWithDescriptions: integer(
    "profile_services_with_descriptions",
  ).notNull(),
  profileServicesTotal: integer("profile_services_total").notNull(),
  profileResponseRate: doublePrecision("profile_response_rate").notNull(),
  profileCompleteness: doublePrecision("profile_completeness").notNull(),
  gbpSnapshot: jsonb("gbp_snapshot").$type<GbpProfileSnapshot>(),
  gbpAudit: jsonb("gbp_audit").$type<LocalGrowthAudit>(),
  suggestionInbox: jsonb("suggestion_inbox").$type<ProfileSuggestion[]>(),
  /** Owner-entered website, used when Google has not supplied one. */
  website: text("website"),
  /** Owner-entered description, used when Google has not supplied one. */
  ownerDescription: text("owner_description"),
});

export const appUser = pgTable("app_user", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  twoFactorEnabled: boolean("two_factor_enabled").notNull(),
  avatarInitials: text("avatar_initials").notNull(),
  passwordHash: text("password_hash"),
  emailVerified: boolean("email_verified").notNull().default(false),
  googleSub: text("google_sub"),
  createdAt: text("created_at"),
  // V8: bumping this revokes every outstanding session JWT for the user.
  sessionVersion: integer("session_version").notNull().default(0),
});

export const passwordResetToken = pgTable("password_reset_token", {
  /** SHA-256 digest of the token sent by email; the raw token is never stored. */
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
});

export const staffInvite = pgTable("staff_invite", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  token: text("token").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  seq: doublePrecision("seq").notNull(),
});

export const staffMember = pgTable("staff_member", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  locationId: text("location_id").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  qrToken: text("qr_token").notNull(),
  active: boolean("active").notNull(),
  streakDays: integer("streak_days").notNull(),
  captures: integer("captures").notNull(),
  detectedReviews: integer("detected_reviews").notNull(),
  lastActiveAt: text("last_active_at"),
  avatarInitials: text("avatar_initials").notNull(),
  seq: doublePrecision("seq").notNull(),
});

// ── Customers & consent (dual flags) ────────────────────────
export const customer = pgTable("customer", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  locationId: text("location_id").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  createdAt: text("created_at").notNull(),
  source: text("source").notNull(),
  staffId: text("staff_id"),
  visitCount: integer("visit_count").notNull(),
  lastVisitAt: text("last_visit_at"),
  lastRequestAt: text("last_request_at"),
  services: jsonb("services").$type<string[]>().notNull(),
  sentiment: text("sentiment"),
  lifecycleStage: text("lifecycle_stage").notNull(),
  suppressedReason: text("suppressed_reason"),
  tags: jsonb("tags").$type<string[]>().notNull(),
  seq: doublePrecision("seq").notNull(),
});

export const customerConsent = pgTable("customer_consent", {
  customerId: text("customer_id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  locationId: text("location_id").notNull(),
  serviceConsent: boolean("service_consent").notNull(),
  serviceConsentAt: text("service_consent_at"),
  marketingConsent: boolean("marketing_consent").notNull(),
  marketingConsentAt: text("marketing_consent_at"),
  consentChannel: text("consent_channel").notNull(),
  consentSourceText: text("consent_source_text").notNull(),
  caslCaptured: boolean("casl_captured").notNull(),
  withdrawnAt: text("withdrawn_at"),
});

// ── Requests / reviews / drafts ─────────────────────────────
export const reviewRequest = pgTable("review_request", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  locationId: text("location_id").notNull(),
  customerId: text("customer_id").notNull(),
  customerName: text("customer_name").notNull(),
  staffId: text("staff_id"),
  channel: text("channel").notNull(),
  token: text("token").notNull(),
  status: text("status").notNull(),
  isTest: boolean("is_test").notNull(),
  createdAt: text("created_at").notNull(),
  sentAt: text("sent_at"),
  openedAt: text("opened_at"),
  clickedAt: text("clicked_at"),
  rating: integer("rating"),
  attributes: jsonb("attributes").$type<string[]>().notNull(),
  privateFeedback: text("private_feedback"),
  suppressedReason: text("suppressed_reason"),
  seq: doublePrecision("seq").notNull(),
});

export const review = pgTable("review", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  locationId: text("location_id").notNull(),
  author: text("author").notNull(),
  rating: integer("rating").notNull(),
  text: text("text").notNull(),
  publishedAt: text("published_at").notNull(),
  source: text("source").notNull(),
  durability: text("durability").notNull(),
  vanishedAt: text("vanished_at"),
  matchedRequestId: text("matched_request_id"),
  matchConfidence: doublePrecision("match_confidence"),
  needsReply: boolean("needs_reply").notNull(),
  seq: doublePrecision("seq").notNull(),
});

export const reviewReply = pgTable("review_reply", {
  reviewId: text("review_id").primaryKey(),
  id: text("id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  locationId: text("location_id").notNull(),
  text: text("text").notNull(),
  tone: text("tone").notNull(),
  source: text("source").notNull(),
  postedAt: text("posted_at").notNull(),
  approvedBy: text("approved_by").notNull(),
});

export const reviewDraft = pgTable("review_draft", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  locationId: text("location_id"),
  requestId: text("request_id"),
  reviewId: text("review_id"),
  kind: text("kind").notNull(),
  variants: jsonb("variants").$type<DraftVariant[]>().notNull(),
  approvedVariantIndex: integer("approved_variant_index"),
  generatedBy: text("generated_by").notNull(),
  createdAt: text("created_at").notNull(),
  seq: doublePrecision("seq").notNull(),
});

// ── GBP Co-Pilot ────────────────────────────────────────────
export const gbpTask = pgTable("gbp_task", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  locationId: text("location_id").notNull(),
  isoWeek: text("iso_week").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  rationale: text("rationale").notNull(),
  preview: text("preview").notNull(),
  status: text("status").notNull(),
  impact: text("impact").notNull(),
  effortMins: integer("effort_mins").notNull(),
  createdAt: text("created_at").notNull(),
  seq: doublePrecision("seq").notNull(),
});

// ── Campaigns ───────────────────────────────────────────────
export const campaign = pgTable("campaign", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  locationId: text("location_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  isAutomation: boolean("is_automation").notNull(),
  consentBasis: text("consent_basis").notNull(),
  channel: text("channel").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  status: text("status").notNull(),
  scheduledAt: text("scheduled_at"),
  audienceTotal: integer("audience_total").notNull(),
  audienceConsented: integer("audience_consented").notNull(),
  excluded: jsonb("excluded").$type<Campaign["excluded"]>().notNull(),
  stats: jsonb("stats").$type<Campaign["stats"]>().notNull(),
  createdAt: text("created_at").notNull(),
  seq: doublePrecision("seq").notNull(),
});

// ── Billing ─────────────────────────────────────────────────
export const subscription = pgTable("subscription", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  tier: text("tier").notNull(),
  interval: text("interval").notNull(),
  status: text("status").notNull(),
  trialEndsAt: text("trial_ends_at"),
  currency: text("currency").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId: text("stripe_price_id"),
  currentPeriodEnd: text("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end"),
  usage: jsonb("usage").$type<Subscription["usage"]>().notNull(),
});

// ── Private feedback / notifications / audit ────────────────
export const privateFeedback = pgTable("private_feedback", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  locationId: text("location_id").notNull(),
  customerName: text("customer_name").notNull(),
  rating: integer("rating").notNull(),
  text: text("text").notNull(),
  createdAt: text("created_at").notNull(),
  resolved: boolean("resolved").notNull(),
  seq: doublePrecision("seq").notNull(),
});

export const notification = pgTable("notification", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  locationId: text("location_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
  read: boolean("read").notNull(),
  seq: doublePrecision("seq").notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  at: text("at").notNull(),
  meta: jsonb("meta").$type<AuditLog["meta"]>(),
  seq: doublePrecision("seq").notNull(),
});

// ── QR assets ───────────────────────────────────────────────
// Promoted out of dataset_meta JSONB: slugs need a GLOBAL unique lookup
// (public /r/[slug] surface) and scans need atomic increments.
export const qrAsset = pgTable(
  "qr_asset",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    locationId: text("location_id").notNull(),
    scope: text("scope").notNull(),
    staffId: text("staff_id"),
    label: text("label").notNull(),
    slug: text("slug").notNull(),
    targetUrl: text("target_url").notNull(),
    scans: integer("scans").notNull().default(0),
    pageOpens: integer("page_opens").notNull().default(0),
    degraded: boolean("degraded").notNull().default(false),
    seq: integer("seq"),
  },
  (table) => [uniqueIndex("qr_asset_slug_uq").on(table.slug)],
);

// ── Aggregate / analytical blocks (single row per workspace) ─
// NOTE: the `qr_assets` JSONB column below is legacy — QR assets now live in
// the relational `qr_asset` table. The column stays in the schema so
// `drizzle-kit push` never tries to drop it on existing deployments, but the
// provider no longer reads it (and only ever writes `[]`).
export const datasetMeta = pgTable("dataset_meta", {
  workspaceId: text("workspace_id").primaryKey(),
  metrics: jsonb("metrics").$type<MetricSnapshot[]>().notNull(),
  competitors: jsonb("competitors").$type<BenchmarkCompetitor[]>().notNull(),
  aeo: jsonb("aeo").$type<AeoSnapshot>().notNull(),
  rankScans: jsonb("rank_scans").$type<RankGridScan[]>().notNull(),
  qrAssets: jsonb("qr_assets").$type<QrAsset[]>().notNull(),
  widgets: jsonb("widgets").$type<Widget[]>().notNull(),
  milestones: jsonb("milestones").$type<Milestone[]>().notNull(),
  suppression: jsonb("suppression").$type<SuppressionEntry[]>().notNull(),
  integrations: jsonb("integrations").$type<Integration[]>().notNull(),
  featureFlags: jsonb("feature_flags").$type<FeatureFlag[]>().notNull(),
  invoices: jsonb("invoices").$type<Invoice[]>().notNull(),
  reports: jsonb("reports").$type<GrowthReport[]>().notNull(),
  agency: jsonb("agency").$type<Agency>().notNull(),
  platform: jsonb("platform").$type<FoundlyData["platform"]>().notNull(),
});

/**
 * Per-workspace Google OAuth credential for the Business Profile connection.
 * Stores only the AES-256-GCM envelope of the refresh token — never plaintext.
 * One row per workspace (the primary key), created on connect and used by the
 * approval-gated profile sync.
 */
export const googleCredential = pgTable("google_credential", {
  workspaceId: text("workspace_id").primaryKey(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  googleAccount: text("google_account"),
  scopes: text("scopes").notNull(),
  connectedAt: text("connected_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const instagramCredential = pgTable("instagram_credential", {
  workspaceId: text("workspace_id").primaryKey(),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  accountId: text("account_id").notNull(),
  username: text("username"),
  scopes: text("scopes").notNull(),
  expiresAt: text("expires_at"),
  connectedAt: text("connected_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Append-preserving Google mutation ledger with one row per idempotent change. */
export const profileMutationJob = pgTable(
  "profile_mutation_job",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    locationId: text("location_id").notNull(),
    suggestionId: text("suggestion_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    target: text("target").notNull(),
    status: text("status").notNull(),
    updateMask: jsonb("update_mask").$type<string[]>().notNull(),
    beforeValue: jsonb("before_value"),
    proposedValue: jsonb("proposed_value").$type<ProfileMutationJob["proposedValue"]>().notNull(),
    providerResponse: jsonb("provider_response"),
    verifiedValue: jsonb("verified_value"),
    rollbackValue: jsonb("rollback_value"),
    attempts: integer("attempts").notNull().default(0),
    approvedAt: text("approved_at").notNull(),
    approvedBy: text("approved_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    startedAt: text("started_at"),
    appliedAt: text("applied_at"),
    failedAt: text("failed_at"),
    lastError: text("last_error"),
  },
  (table) => [uniqueIndex("profile_mutation_job_idempotency_uq").on(table.idempotencyKey)],
);

/** Append-preserving Google content publication ledger. */
export const contentPublishingJob = pgTable(
  "content_publishing_job",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    locationId: text("location_id").notNull(),
    suggestionId: text("suggestion_id").notNull(),
    assetId: text("asset_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    exactPayload: jsonb("exact_payload").notNull(),
    providerResponse: jsonb("provider_response"),
    providerResourceName: text("provider_resource_name"),
    verifiedValue: jsonb("verified_value"),
    attempts: integer("attempts").notNull().default(0),
    approvedAt: text("approved_at").notNull(),
    approvedBy: text("approved_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    startedAt: text("started_at"),
    publishedAt: text("published_at"),
    failedAt: text("failed_at"),
    lastError: text("last_error"),
  },
  (table) => [uniqueIndex("content_publishing_job_idempotency_uq").on(table.idempotencyKey)],
);

/** Daily/hourly read-only monitoring ledger. */
export const monitoringRun = pgTable(
  "monitoring_run",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    windowKey: text("window_key").notNull(),
    trigger: text("trigger").notNull(),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    summary: jsonb("summary"),
    startedAt: text("started_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
    lastError: text("last_error"),
  },
  (table) => [uniqueIndex("monitoring_run_workspace_window_uq").on(table.workspaceId, table.windowKey)],
);

/** Generated content assets remain private and are served only after tenant authentication. */
export const aiContentAsset = pgTable(
  "ai_content_asset",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    locationId: text("location_id").notNull(),
    suggestionId: text("suggestion_id").notNull(),
    kind: text("kind").$type<AiContentAsset["kind"]>().notNull(),
    mimeType: text("mime_type").$type<AiContentAsset["mimeType"]>().notNull(),
    base64Data: text("base64_data").notNull(),
    prompt: text("prompt").notNull(),
    altText: text("alt_text").notNull(),
    model: text("model").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("ai_content_asset_suggestion_uq").on(table.workspaceId, table.suggestionId)],
);
