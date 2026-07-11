import {
  pgTable,
  text,
  integer,
  boolean,
  doublePrecision,
  jsonb,
} from "drizzle-orm/pg-core";
import type {
  WhiteLabelConfig,
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
});

export const appUser = pgTable("app_user", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  twoFactorEnabled: boolean("two_factor_enabled").notNull(),
  avatarInitials: text("avatar_initials").notNull(),
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

// ── Aggregate / analytical blocks (single row per workspace) ─
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
