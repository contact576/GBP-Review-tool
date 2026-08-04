import { and, eq, gt, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, type FoundlyDb } from "../db/client";
import { ensureSchema } from "../db/ensure";
import * as t from "../db/schema";
import { emptyFoundlyData, makeSlug } from "./empty";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { canonicalPhone } from "@/lib/sms/phone";
import { PLANS } from "@/lib/billing/plans";
import { mergeSuggestionInbox } from "@/lib/suggestions/inbox";
import {
  buildGooglePublicUpdate,
  upsertSnapshot,
  friendlyPlacesError,
  PUBLIC_REVIEW_ID_PREFIX,
  GBP_REVIEW_ID_PREFIX,
} from "@/lib/google/public-sync";
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
  SaveInstagramCredentialInput,
  ProfileSuggestionPatch,
  ProfileMutationJobPatch,
  ContentPublishingJobPatch,
  MonitoringRunPatch,
} from "./provider";
import type {
  FoundlyData,
  Organization,
  Workspace,
  Location,
  User,
  StaffInvite,
  StaffMember,
  Customer,
  CustomerConsent,
  ReviewRequest,
  Review,
  ReviewReply,
  ReviewDraft,
  GbpTask,
  Campaign,
  Subscription,
  PrivateFeedback,
  Notification,
  AuditLog,
  QrAsset,
  Integration,
  WorkspaceSettings,
  ProfileSuggestion,
  ProfileMutationJob,
  ContentPublishingJob,
  MonitoringRun,
  AiContentAsset,
  BusinessDetailsPatch,
} from "./types";

/**
 * Postgres/Drizzle DataProvider — the real persistence path (DATABASE_URL set).
 *
 * MULTI-TENANT: every scoped read and mutation filters by `workspace_id` so a
 * tenant can never see or touch another tenant's rows. Token- and slug-keyed
 * lookups (`getRequestByToken`, `advanceRequest`, `submitPrivateFeedback`,
 * `mintRequestFromQrSlug`) are global — tokens/slugs are unguessable public
 * identifiers — but every row they touch is resolved to (and then scoped by)
 * the owning row's workspace.
 *
 * Every mutation mirrors memory-provider.ts semantics exactly, including its
 * side effects (staff capture++/streak activity, subscription usage counters,
 * audit rows, notifications, consent-filtered campaign audiences, and profile
 * completeness / response-rate bumps). Reads reassemble the identical
 * FoundlyData shape produced by emptyFoundlyData()/buildSeed().
 *
 * The neon-http driver does not support interactive transactions, so the
 * multi-statement registration path uses `db.batch([...])` (single atomic
 * round-trip) instead of `db.transaction()`.
 */

// ── Row type aliases ────────────────────────────────────────
type CustomerRow = typeof t.customer.$inferSelect;
type ConsentRow = typeof t.customerConsent.$inferSelect;
type RequestRow = typeof t.reviewRequest.$inferSelect;
type ReviewRow = typeof t.review.$inferSelect;
type ReplyRow = typeof t.reviewReply.$inferSelect;
type DraftRow = typeof t.reviewDraft.$inferSelect;
type TaskRow = typeof t.gbpTask.$inferSelect;
type CampaignRow = typeof t.campaign.$inferSelect;
type StaffRow = typeof t.staffMember.$inferSelect;
type SubscriptionRow = typeof t.subscription.$inferSelect;
type PrivateFeedbackRow = typeof t.privateFeedback.$inferSelect;
type NotificationRow = typeof t.notification.$inferSelect;
type AiContentAssetRow = typeof t.aiContentAsset.$inferSelect;
type AuditRow = typeof t.auditLog.$inferSelect;
type OrgRow = typeof t.organization.$inferSelect;
type WorkspaceRow = typeof t.workspace.$inferSelect;
type UserRow = typeof t.appUser.$inferSelect;
type LocationRow = typeof t.location.$inferSelect;
type InviteRow = typeof t.staffInvite.$inferSelect;
type QrRow = typeof t.qrAsset.$inferSelect;
type MutationJobRow = typeof t.profileMutationJob.$inferSelect;
type ContentPublishingJobRow = typeof t.contentPublishingJob.$inferSelect;
type MonitoringRunRow = typeof t.monitoringRun.$inferSelect;

// ── Small helpers ───────────────────────────────────────────
function nowIso(): string {
  return new Date().toISOString();
}
function id(prefix: string): string {
  return `${prefix}_${nanoid()}`;
}
/** Newest-first ordering key for mutation inserts (mirrors `unshift`). */
function front(): number {
  return -Date.now();
}
/** Append ordering key (mirrors `push`) — sorts after every seed seq. */
function back(): number {
  return Date.now();
}
function one<T>(rows: T[], name: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(
      `Foundly DB is missing ${name}. Run "npm run db:seed" or re-register.`,
    );
  }
  return row;
}

interface Ctx {
  workspaceId: string;
  location: LocationRow;
}
/** Loads the workspace's single location row (throws when absent). */
async function loadContext(db: FoundlyDb, workspaceId: string): Promise<Ctx> {
  const loc = one(
    await db
      .select()
      .from(t.location)
      .where(eq(t.location.workspaceId, workspaceId))
      .limit(1),
    `location for workspace ${workspaceId}`,
  );
  return { workspaceId, location: loc };
}

async function bumpUsage(
  db: FoundlyDb,
  workspaceId: string,
  fn: (u: Subscription["usage"]) => Subscription["usage"],
): Promise<void> {
  const rows = await db
    .select()
    .from(t.subscription)
    .where(eq(t.subscription.workspaceId, workspaceId))
    .limit(1);
  const sub = rows[0];
  if (!sub) return;
  await db
    .update(t.subscription)
    .set({ usage: fn(sub.usage) })
    .where(
      and(
        eq(t.subscription.id, sub.id),
        eq(t.subscription.workspaceId, workspaceId),
      ),
    );
}

async function findUserRowByEmail(
  db: FoundlyDb,
  email: string,
): Promise<UserRow | null> {
  const key = email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(t.appUser)
    .where(
      and(
        sql`lower(${t.appUser.email}) = ${key}`,
        or(isNotNull(t.appUser.passwordHash), isNotNull(t.appUser.googleSub)),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as AuthUser["role"],
    workspaceId: row.workspaceId,
    isDemo: false, // the database never holds demo data
    sessionVersion: row.sessionVersion ?? 0,
  };
}

// ── Row → domain mappers ────────────────────────────────────
function mapOrg(row: OrgRow): Organization {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legalName,
    region: row.region as Organization["region"],
    orgType: row.orgType as Organization["orgType"],
    billingEmail: row.billingEmail,
  };
}

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    vertical: row.vertical as Workspace["vertical"],
    industryConfig: row.industryConfig ?? undefined,
    region: row.region as Workspace["region"],
    timezone: row.timezone,
    plan: row.plan as Workspace["plan"],
    createdAt: row.createdAt,
    isDemo: row.isDemo,
    whiteLabel: row.whiteLabel ?? undefined,
    settings: row.settings ?? undefined,
    referredByWorkspaceId: row.referredByWorkspaceId ?? undefined,
    referralRewardStatus: (row.referralRewardStatus ?? undefined) as Workspace["referralRewardStatus"],
    referralRewardAppliedAt: row.referralRewardAppliedAt ?? undefined,
  };
}

function mapLocation(row: LocationRow): Location {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    category: row.category,
    vertical: row.vertical as Location["vertical"],
    address: row.address,
    city: row.city,
    region: row.region as Location["region"],
    timezone: row.timezone,
    googlePlaceId: row.googlePlaceId ?? undefined,
    reviewUrl: row.reviewUrl,
    rating: row.rating,
    reviewCount: row.reviewCount,
    joinedAt: row.joinedAt,
    gbpConnected: row.gbpConnected,
    gbpSnapshot: row.gbpSnapshot ?? undefined,
    gbpAudit: row.gbpAudit ?? undefined,
    suggestionInbox: row.suggestionInbox ?? undefined,
    website: row.website ?? undefined,
    ownerDescription: row.ownerDescription ?? undefined,
    profile: {
      description: row.profileDescription,
      primaryCategory: row.profilePrimaryCategory,
      secondaryCategories: row.profileSecondaryCategories,
      photoCount: row.profilePhotoCount,
      postCount: row.profilePostCount,
      qnaCount: row.profileQnaCount,
      hoursSet: row.profileHoursSet,
      holidayHoursSet: row.profileHolidayHoursSet,
      servicesWithDescriptions: row.profileServicesWithDescriptions,
      servicesTotal: row.profileServicesTotal,
      responseRate: row.profileResponseRate,
      completeness: row.profileCompleteness,
    },
  };
}

/** Domain user WITHOUT credential material (passwordHash never leaves auth). */
function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as User["role"],
    workspaceId: row.workspaceId,
    twoFactorEnabled: row.twoFactorEnabled,
    avatarInitials: row.avatarInitials,
  };
}

function mapInvite(row: InviteRow): StaffInvite {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    role: row.role as StaffInvite["role"],
    token: row.token,
    status: row.status as StaffInvite["status"],
    createdAt: row.createdAt,
  };
}

function mapStaff(row: StaffRow): StaffMember {
  return {
    id: row.id,
    locationId: row.locationId,
    displayName: row.displayName,
    role: row.role as StaffMember["role"],
    qrToken: row.qrToken,
    active: row.active,
    streakDays: row.streakDays,
    captures: row.captures,
    detectedReviews: row.detectedReviews,
    lastActiveAt: row.lastActiveAt ?? undefined,
    avatarInitials: row.avatarInitials,
  };
}

function mapConsent(row: ConsentRow): CustomerConsent {
  return {
    serviceConsent: row.serviceConsent,
    serviceConsentAt: row.serviceConsentAt ?? undefined,
    marketingConsent: row.marketingConsent,
    marketingConsentAt: row.marketingConsentAt ?? undefined,
    consentChannel: row.consentChannel as CustomerConsent["consentChannel"],
    consentSourceText: row.consentSourceText,
    caslCaptured: row.caslCaptured,
    withdrawnAt: row.withdrawnAt ?? undefined,
  };
}

function mapCustomer(row: CustomerRow, consent: ConsentRow | undefined): Customer {
  if (!consent) {
    throw new Error(`Customer ${row.id} is missing its consent row`);
  }
  return {
    id: row.id,
    locationId: row.locationId,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    createdAt: row.createdAt,
    source: row.source as Customer["source"],
    staffId: row.staffId ?? undefined,
    visitCount: row.visitCount,
    lastVisitAt: row.lastVisitAt ?? undefined,
    lastRequestAt: row.lastRequestAt ?? undefined,
    services: row.services,
    sentiment: (row.sentiment ?? undefined) as Customer["sentiment"],
    lifecycleStage: row.lifecycleStage as Customer["lifecycleStage"],
    consent: mapConsent(consent),
    suppressedReason: row.suppressedReason ?? undefined,
    tags: row.tags,
  };
}

function mapRequest(row: RequestRow): ReviewRequest {
  return {
    id: row.id,
    locationId: row.locationId,
    customerId: row.customerId,
    customerName: row.customerName,
    staffId: row.staffId ?? undefined,
    channel: row.channel as ReviewRequest["channel"],
    token: row.token,
    status: row.status as ReviewRequest["status"],
    isTest: row.isTest,
    createdAt: row.createdAt,
    sentAt: row.sentAt ?? undefined,
    openedAt: row.openedAt ?? undefined,
    clickedAt: row.clickedAt ?? undefined,
    rating: row.rating == null ? undefined : (row.rating as ReviewRequest["rating"]),
    attributes: row.attributes,
    privateFeedback: row.privateFeedback ?? undefined,
    suppressedReason: row.suppressedReason ?? undefined,
  };
}

function mapReply(row: ReplyRow): ReviewReply {
  return {
    id: row.id,
    text: row.text,
    tone: row.tone as ReviewReply["tone"],
    source: row.source as ReviewReply["source"],
    postedAt: row.postedAt,
    approvedBy: row.approvedBy,
  };
}

function mapReview(row: ReviewRow, reply: ReplyRow | undefined): Review {
  return {
    id: row.id,
    locationId: row.locationId,
    author: row.author,
    rating: row.rating as Review["rating"],
    text: row.text,
    publishedAt: row.publishedAt,
    source: "google",
    durability: row.durability as Review["durability"],
    vanishedAt: row.vanishedAt ?? undefined,
    reply: reply ? mapReply(reply) : undefined,
    matchedRequestId: row.matchedRequestId ?? undefined,
    matchConfidence: row.matchConfidence ?? undefined,
    needsReply: row.needsReply,
  };
}

function mapDraft(row: DraftRow): ReviewDraft {
  return {
    id: row.id,
    requestId: row.requestId ?? undefined,
    reviewId: row.reviewId ?? undefined,
    kind: row.kind as ReviewDraft["kind"],
    variants: row.variants,
    approvedVariantIndex: row.approvedVariantIndex ?? undefined,
    generatedBy: row.generatedBy as ReviewDraft["generatedBy"],
    createdAt: row.createdAt,
  };
}

function mapTask(row: TaskRow): GbpTask {
  return {
    id: row.id,
    locationId: row.locationId,
    isoWeek: row.isoWeek,
    kind: row.kind as GbpTask["kind"],
    title: row.title,
    rationale: row.rationale,
    preview: row.preview,
    status: row.status as GbpTask["status"],
    impact: row.impact as GbpTask["impact"],
    effortMins: row.effortMins,
    createdAt: row.createdAt,
  };
}

function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    locationId: row.locationId,
    name: row.name,
    type: row.type as Campaign["type"],
    isAutomation: row.isAutomation,
    consentBasis: row.consentBasis as Campaign["consentBasis"],
    channel: row.channel as Campaign["channel"],
    subject: row.subject ?? undefined,
    body: row.body,
    status: row.status as Campaign["status"],
    scheduledAt: row.scheduledAt ?? undefined,
    audienceTotal: row.audienceTotal,
    audienceConsented: row.audienceConsented,
    excluded: row.excluded,
    stats: row.stats,
    createdAt: row.createdAt,
  };
}

function mapSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    tier: row.tier as Subscription["tier"],
    interval: row.interval as Subscription["interval"],
    status: row.status as Subscription["status"],
    trialEndsAt: row.trialEndsAt ?? undefined,
    currency: row.currency as Subscription["currency"],
    stripeCustomerId: row.stripeCustomerId ?? undefined,
    stripeSubscriptionId: row.stripeSubscriptionId ?? undefined,
    stripePriceId: row.stripePriceId ?? undefined,
    currentPeriodEnd: row.currentPeriodEnd ?? undefined,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? undefined,
    usage: row.usage,
  };
}

function mapPrivateFeedback(row: PrivateFeedbackRow): PrivateFeedback {
  return {
    id: row.id,
    locationId: row.locationId,
    customerName: row.customerName,
    rating: row.rating as PrivateFeedback["rating"],
    text: row.text,
    createdAt: row.createdAt,
    resolved: row.resolved,
  };
}

function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    locationId: row.locationId,
    kind: row.kind as Notification["kind"],
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
    read: row.read,
  };
}

function mapAudit(row: AuditRow): AuditLog {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    actor: row.actor,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    at: row.at,
    meta: row.meta ?? undefined,
  };
}

function mapQr(row: QrRow): QrAsset {
  return {
    id: row.id,
    locationId: row.locationId,
    scope: row.scope as QrAsset["scope"],
    staffId: row.staffId ?? undefined,
    label: row.label,
    slug: row.slug,
    targetUrl: row.targetUrl,
    scans: row.scans,
    pageOpens: row.pageOpens,
    degraded: row.degraded,
  };
}

// ── Domain → insert-row builders (shared by seed + mutations) ─
function buildOrgRow(
  o: Organization,
  workspaceId: string,
): typeof t.organization.$inferInsert {
  return {
    id: o.id,
    workspaceId,
    name: o.name,
    legalName: o.legalName,
    region: o.region,
    orgType: o.orgType,
    billingEmail: o.billingEmail,
  };
}

function buildWorkspaceRow(w: Workspace): typeof t.workspace.$inferInsert {
  return {
    id: w.id,
    organizationId: w.organizationId,
    name: w.name,
    vertical: w.vertical,
    region: w.region,
    timezone: w.timezone,
    plan: w.plan,
    createdAt: w.createdAt,
    whiteLabel: w.whiteLabel,
    industryConfig: w.industryConfig ?? null,
    settings: w.settings ?? null,
    isDemo: w.isDemo ?? false,
    referredByWorkspaceId: w.referredByWorkspaceId,
    referralRewardStatus: w.referralRewardStatus,
    referralRewardAppliedAt: w.referralRewardAppliedAt,
  };
}

function buildLocationRow(l: Location): typeof t.location.$inferInsert {
  return {
    id: l.id,
    workspaceId: l.workspaceId,
    name: l.name,
    category: l.category,
    vertical: l.vertical,
    address: l.address,
    city: l.city,
    region: l.region,
    timezone: l.timezone,
    googlePlaceId: l.googlePlaceId,
    reviewUrl: l.reviewUrl,
    rating: l.rating,
    reviewCount: l.reviewCount,
    joinedAt: l.joinedAt,
    gbpConnected: l.gbpConnected,
    profileDescription: l.profile.description,
    profilePrimaryCategory: l.profile.primaryCategory,
    profileSecondaryCategories: l.profile.secondaryCategories,
    profilePhotoCount: l.profile.photoCount,
    profilePostCount: l.profile.postCount,
    profileQnaCount: l.profile.qnaCount,
    profileHoursSet: l.profile.hoursSet,
    profileHolidayHoursSet: l.profile.holidayHoursSet,
    profileServicesWithDescriptions: l.profile.servicesWithDescriptions,
    profileServicesTotal: l.profile.servicesTotal,
    profileResponseRate: l.profile.responseRate,
    profileCompleteness: l.profile.completeness,
    gbpSnapshot: l.gbpSnapshot,
    gbpAudit: l.gbpAudit,
    suggestionInbox: l.suggestionInbox,
    website: l.website ?? null,
    ownerDescription: l.ownerDescription ?? null,
  };
}

function buildUserRow(
  u: User,
  auth: {
    passwordHash?: string | null;
    googleSub?: string | null;
    emailVerified?: boolean;
    createdAt?: string | null;
  } = {},
): typeof t.appUser.$inferInsert {
  return {
    id: u.id,
    workspaceId: u.workspaceId,
    email: u.email,
    name: u.name,
    role: u.role,
    twoFactorEnabled: u.twoFactorEnabled,
    avatarInitials: u.avatarInitials,
    passwordHash: auth.passwordHash ?? u.passwordHash ?? null,
    emailVerified: auth.emailVerified ?? u.emailVerified ?? true,
    googleSub: auth.googleSub ?? u.googleSub ?? null,
    createdAt: auth.createdAt ?? null,
  };
}

function buildInviteRow(
  i: StaffInvite,
  seq: number,
): typeof t.staffInvite.$inferInsert {
  return {
    id: i.id,
    workspaceId: i.workspaceId,
    email: i.email,
    role: i.role,
    token: i.token,
    status: i.status,
    createdAt: i.createdAt,
    seq,
  };
}

function buildStaffRow(
  s: StaffMember,
  workspaceId: string,
  seq: number,
): typeof t.staffMember.$inferInsert {
  return {
    id: s.id,
    workspaceId,
    locationId: s.locationId,
    displayName: s.displayName,
    role: s.role,
    qrToken: s.qrToken,
    active: s.active,
    streakDays: s.streakDays,
    captures: s.captures,
    detectedReviews: s.detectedReviews,
    lastActiveAt: s.lastActiveAt,
    avatarInitials: s.avatarInitials,
    seq,
  };
}

function buildCustomerRow(
  c: Customer,
  workspaceId: string,
  seq: number,
): typeof t.customer.$inferInsert {
  return {
    id: c.id,
    workspaceId,
    locationId: c.locationId,
    name: c.name,
    email: c.email,
    phone: c.phone,
    createdAt: c.createdAt,
    source: c.source,
    staffId: c.staffId,
    visitCount: c.visitCount,
    lastVisitAt: c.lastVisitAt,
    lastRequestAt: c.lastRequestAt,
    services: c.services,
    sentiment: c.sentiment,
    lifecycleStage: c.lifecycleStage,
    suppressedReason: c.suppressedReason,
    tags: c.tags,
    seq,
  };
}

function buildConsentRow(
  customerId: string,
  locationId: string,
  workspaceId: string,
  consent: CustomerConsent,
): typeof t.customerConsent.$inferInsert {
  return {
    customerId,
    workspaceId,
    locationId,
    serviceConsent: consent.serviceConsent,
    serviceConsentAt: consent.serviceConsentAt,
    marketingConsent: consent.marketingConsent,
    marketingConsentAt: consent.marketingConsentAt,
    consentChannel: consent.consentChannel,
    consentSourceText: consent.consentSourceText,
    caslCaptured: consent.caslCaptured,
    withdrawnAt: consent.withdrawnAt,
  };
}

function buildRequestRow(
  r: ReviewRequest,
  workspaceId: string,
  seq: number,
): typeof t.reviewRequest.$inferInsert {
  return {
    id: r.id,
    workspaceId,
    locationId: r.locationId,
    customerId: r.customerId,
    customerName: r.customerName,
    staffId: r.staffId,
    channel: r.channel,
    token: r.token,
    status: r.status,
    isTest: r.isTest,
    createdAt: r.createdAt,
    sentAt: r.sentAt,
    openedAt: r.openedAt,
    clickedAt: r.clickedAt,
    rating: r.rating,
    attributes: r.attributes,
    privateFeedback: r.privateFeedback,
    suppressedReason: r.suppressedReason,
    seq,
  };
}

function buildReviewRow(
  r: Review,
  workspaceId: string,
  seq: number,
): typeof t.review.$inferInsert {
  return {
    id: r.id,
    workspaceId,
    locationId: r.locationId,
    author: r.author,
    rating: r.rating,
    text: r.text,
    publishedAt: r.publishedAt,
    source: r.source,
    durability: r.durability,
    vanishedAt: r.vanishedAt,
    matchedRequestId: r.matchedRequestId,
    matchConfidence: r.matchConfidence,
    needsReply: r.needsReply,
    seq,
  };
}

function buildReplyRow(
  reviewId: string,
  reply: ReviewReply,
  workspaceId: string,
  locationId: string,
): typeof t.reviewReply.$inferInsert {
  return {
    reviewId,
    id: reply.id,
    workspaceId,
    locationId,
    text: reply.text,
    tone: reply.tone,
    source: reply.source,
    postedAt: reply.postedAt,
    approvedBy: reply.approvedBy,
  };
}

function buildDraftRow(
  d: ReviewDraft,
  workspaceId: string,
  locationId: string,
  seq: number,
): typeof t.reviewDraft.$inferInsert {
  return {
    id: d.id,
    workspaceId,
    locationId,
    requestId: d.requestId,
    reviewId: d.reviewId,
    kind: d.kind,
    variants: d.variants,
    approvedVariantIndex: d.approvedVariantIndex,
    generatedBy: d.generatedBy,
    createdAt: d.createdAt,
    seq,
  };
}

function buildTaskRow(
  tk: GbpTask,
  workspaceId: string,
  seq: number,
): typeof t.gbpTask.$inferInsert {
  return {
    id: tk.id,
    workspaceId,
    locationId: tk.locationId,
    isoWeek: tk.isoWeek,
    kind: tk.kind,
    title: tk.title,
    rationale: tk.rationale,
    preview: tk.preview,
    status: tk.status,
    impact: tk.impact,
    effortMins: tk.effortMins,
    createdAt: tk.createdAt,
    seq,
  };
}

function buildCampaignRow(
  c: Campaign,
  workspaceId: string,
  seq: number,
): typeof t.campaign.$inferInsert {
  return {
    id: c.id,
    workspaceId,
    locationId: c.locationId,
    name: c.name,
    type: c.type,
    isAutomation: c.isAutomation,
    consentBasis: c.consentBasis,
    channel: c.channel,
    subject: c.subject,
    body: c.body,
    status: c.status,
    scheduledAt: c.scheduledAt,
    audienceTotal: c.audienceTotal,
    audienceConsented: c.audienceConsented,
    excluded: c.excluded,
    stats: c.stats,
    createdAt: c.createdAt,
    seq,
  };
}

function buildSubscriptionRow(s: Subscription): typeof t.subscription.$inferInsert {
  return {
    id: s.id,
    workspaceId: s.workspaceId,
    tier: s.tier,
    interval: s.interval,
    status: s.status,
    trialEndsAt: s.trialEndsAt,
    currency: s.currency,
    stripeCustomerId: s.stripeCustomerId,
    stripeSubscriptionId: s.stripeSubscriptionId,
    stripePriceId: s.stripePriceId,
    currentPeriodEnd: s.currentPeriodEnd,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    usage: s.usage,
  };
}

function buildPrivateFeedbackRow(
  p: PrivateFeedback,
  workspaceId: string,
  seq: number,
): typeof t.privateFeedback.$inferInsert {
  return {
    id: p.id,
    workspaceId,
    locationId: p.locationId,
    customerName: p.customerName,
    rating: p.rating,
    text: p.text,
    createdAt: p.createdAt,
    resolved: p.resolved,
    seq,
  };
}

function buildNotificationRow(
  n: Notification,
  workspaceId: string,
  seq: number,
): typeof t.notification.$inferInsert {
  return {
    id: n.id,
    workspaceId,
    locationId: n.locationId,
    kind: n.kind,
    title: n.title,
    body: n.body,
    createdAt: n.createdAt,
    read: n.read,
    seq,
  };
}

function buildAuditRow(
  a: AuditLog,
  seq: number,
): typeof t.auditLog.$inferInsert {
  return {
    id: a.id,
    workspaceId: a.workspaceId,
    actor: a.actor,
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId,
    at: a.at,
    meta: a.meta,
    seq,
  };
}

function buildQrRow(
  q: QrAsset,
  workspaceId: string,
  seq: number,
): typeof t.qrAsset.$inferInsert {
  return {
    id: q.id,
    workspaceId,
    locationId: q.locationId,
    scope: q.scope,
    staffId: q.staffId,
    label: q.label,
    slug: q.slug,
    targetUrl: q.targetUrl,
    scans: q.scans,
    pageOpens: q.pageOpens,
    degraded: q.degraded,
    seq,
  };
}

/** dataset_meta row. `qrAssets` is the legacy JSONB column — always `[]` now. */
function buildMetaRow(data: FoundlyData): typeof t.datasetMeta.$inferInsert {
  return {
    workspaceId: data.workspace.id,
    metrics: data.metrics,
    competitors: data.competitors,
    aeo: data.aeo,
    rankScans: data.rankScans,
    qrAssets: [],
    widgets: data.widgets,
    milestones: data.milestones,
    suppression: data.suppression,
    integrations: data.integrations,
    featureFlags: data.featureFlags,
    invoices: data.invoices,
    reports: data.reports,
    agency: data.agency,
    platform: data.platform,
  };
}

// ── Atomic workspace creation (register / Google sign-up) ────
// A real interactive transaction: either the whole tenant (org, workspace,
// location, owner, subscription, meta) lands or none of it does. A partial
// failure here would otherwise leave an account that can authenticate but has
// no workspace to read.
async function createWorkspaceWithOwner(
  db: FoundlyDb,
  data: FoundlyData,
  auth: { passwordHash?: string; googleSub?: string },
): Promise<void> {
  const ws = data.workspace.id;
  const now = nowIso();
  await db.transaction(async (tx) => {
    await tx.insert(t.organization).values(buildOrgRow(data.organization, ws));
    await tx.insert(t.workspace).values(buildWorkspaceRow(data.workspace));
    await tx.insert(t.location).values(buildLocationRow(data.location));
    await tx.insert(t.appUser).values(
      buildUserRow(data.owner, {
        passwordHash: auth.passwordHash ?? null,
        googleSub: auth.googleSub ?? null,
        emailVerified: true, // auto-verified until email sending is configured
        createdAt: now,
      }),
    );
    await tx.insert(t.subscription).values(buildSubscriptionRow(data.subscription));
    await tx.insert(t.datasetMeta).values(buildMetaRow(data));
    if (data.qrAssets.length > 0) {
      await tx
        .insert(t.qrAsset)
        .values(data.qrAssets.map((q, i) => buildQrRow(q, ws, i)));
    }
    if (data.notifications.length > 0) {
      await tx
        .insert(t.notification)
        .values(data.notifications.map((n, i) => buildNotificationRow(n, ws, i)));
    }
  });
}

function mapMutationJob(row: MutationJobRow): ProfileMutationJob {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    locationId: row.locationId,
    suggestionId: row.suggestionId,
    idempotencyKey: row.idempotencyKey,
    target: row.target as ProfileMutationJob["target"],
    status: row.status as ProfileMutationJob["status"],
    updateMask: row.updateMask,
    beforeValue: row.beforeValue ?? undefined,
    proposedValue: row.proposedValue,
    providerResponse: row.providerResponse ?? undefined,
    verifiedValue: row.verifiedValue ?? undefined,
    rollbackValue: row.rollbackValue ?? undefined,
    attempts: row.attempts,
    approvedAt: row.approvedAt,
    approvedBy: row.approvedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt ?? undefined,
    appliedAt: row.appliedAt ?? undefined,
    failedAt: row.failedAt ?? undefined,
    lastError: row.lastError ?? undefined,
  };
}

function buildMutationJobRow(job: ProfileMutationJob): typeof t.profileMutationJob.$inferInsert {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    locationId: job.locationId,
    suggestionId: job.suggestionId,
    idempotencyKey: job.idempotencyKey,
    target: job.target,
    status: job.status,
    updateMask: job.updateMask,
    beforeValue: job.beforeValue,
    proposedValue: job.proposedValue,
    providerResponse: job.providerResponse,
    verifiedValue: job.verifiedValue,
    rollbackValue: job.rollbackValue,
    attempts: job.attempts,
    approvedAt: job.approvedAt,
    approvedBy: job.approvedBy,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    appliedAt: job.appliedAt,
    failedAt: job.failedAt,
    lastError: job.lastError,
  };
}

function mapAiContentAsset(row: AiContentAssetRow): AiContentAsset {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    locationId: row.locationId,
    suggestionId: row.suggestionId,
    kind: row.kind,
    mimeType: row.mimeType,
    base64Data: row.base64Data,
    prompt: row.prompt,
    altText: row.altText,
    model: row.model,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapContentPublishingJob(row: ContentPublishingJobRow): ContentPublishingJob {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    locationId: row.locationId,
    suggestionId: row.suggestionId,
    assetId: row.assetId ?? undefined,
    idempotencyKey: row.idempotencyKey,
    kind: row.kind as ContentPublishingJob["kind"],
    status: row.status as ContentPublishingJob["status"],
    exactPayload: row.exactPayload,
    providerResponse: row.providerResponse ?? undefined,
    providerResourceName: row.providerResourceName ?? undefined,
    verifiedValue: row.verifiedValue ?? undefined,
    attempts: row.attempts,
    approvedAt: row.approvedAt,
    approvedBy: row.approvedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt ?? undefined,
    publishedAt: row.publishedAt ?? undefined,
    failedAt: row.failedAt ?? undefined,
    lastError: row.lastError ?? undefined,
  };
}

function buildContentPublishingJobRow(job: ContentPublishingJob): typeof t.contentPublishingJob.$inferInsert {
  return { ...job };
}

function mapMonitoringRun(row: MonitoringRunRow): MonitoringRun {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    windowKey: row.windowKey,
    trigger: row.trigger as MonitoringRun["trigger"],
    status: row.status as MonitoringRun["status"],
    attempts: row.attempts,
    summary: row.summary as MonitoringRun["summary"],
    startedAt: row.startedAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? undefined,
    lastError: row.lastError ?? undefined,
  };
}

/** Create another location workspace under an existing organization row. */
async function createOrganizationLocation(
  db: FoundlyDb,
  data: FoundlyData,
): Promise<void> {
  const ws = data.workspace.id;
  await db.transaction(async (tx) => {
    await tx.insert(t.workspace).values(buildWorkspaceRow(data.workspace));
    await tx.insert(t.location).values(buildLocationRow(data.location));
    await tx.insert(t.appUser).values(
      buildUserRow(data.owner, {
        passwordHash: null,
        googleSub: null,
        emailVerified: true,
        createdAt: data.workspace.createdAt,
      }),
    );
    await tx.insert(t.subscription).values(buildSubscriptionRow(data.subscription));
    await tx.insert(t.datasetMeta).values(buildMetaRow(data));
    if (data.qrAssets.length > 0) {
      await tx
        .insert(t.qrAsset)
        .values(data.qrAssets.map((qr, index) => buildQrRow(qr, ws, index)));
    }
    if (data.notifications.length > 0) {
      await tx
        .insert(t.notification)
        .values(
          data.notifications.map((notification, index) =>
            buildNotificationRow(notification, ws, index),
          ),
        );
    }
  });
}

// ── Clear + seed (shared with the seed-runner) ──────────────
export async function clearAllTables(): Promise<void> {
  const db = getDb();
  await db.delete(t.profileMutationJob);
  await db.delete(t.instagramCredential);
  await db.delete(t.googleCredential);
  await db.delete(t.reviewReply);
  await db.delete(t.customerConsent);
  await db.delete(t.reviewDraft);
  await db.delete(t.reviewRequest);
  await db.delete(t.review);
  await db.delete(t.gbpTask);
  await db.delete(t.campaign);
  await db.delete(t.privateFeedback);
  await db.delete(t.notification);
  await db.delete(t.auditLog);
  await db.delete(t.customer);
  await db.delete(t.staffMember);
  await db.delete(t.staffInvite);
  await db.delete(t.qrAsset);
  await db.delete(t.subscription);
  await db.delete(t.appUser);
  await db.delete(t.location);
  await db.delete(t.workspace);
  await db.delete(t.organization);
  await db.delete(t.datasetMeta);
}

export async function seedDatabase(data: FoundlyData): Promise<void> {
  const db = getDb();
  const ws = data.workspace.id;

  await db.insert(t.organization).values(buildOrgRow(data.organization, ws));
  await db.insert(t.workspace).values(buildWorkspaceRow(data.workspace));
  await db.insert(t.location).values(buildLocationRow(data.location));
  await db.insert(t.appUser).values(
    buildUserRow(data.owner, { createdAt: data.workspace.createdAt }),
  );

  if (data.invites.length) {
    await db
      .insert(t.staffInvite)
      .values(data.invites.map((inv, i) => buildInviteRow(inv, i)));
  }

  if (data.staff.length) {
    await db
      .insert(t.staffMember)
      .values(data.staff.map((s, i) => buildStaffRow(s, ws, i)));
  }

  if (data.customers.length) {
    await db
      .insert(t.customer)
      .values(data.customers.map((c, i) => buildCustomerRow(c, ws, i)));
    await db
      .insert(t.customerConsent)
      .values(
        data.customers.map((c) =>
          buildConsentRow(c.id, c.locationId, ws, c.consent),
        ),
      );
  }

  if (data.requests.length) {
    await db
      .insert(t.reviewRequest)
      .values(data.requests.map((r, i) => buildRequestRow(r, ws, i)));
  }

  if (data.reviews.length) {
    await db
      .insert(t.review)
      .values(data.reviews.map((r, i) => buildReviewRow(r, ws, i)));
    const replies = data.reviews
      .filter((r): r is Review & { reply: ReviewReply } => Boolean(r.reply))
      .map((r) => buildReplyRow(r.id, r.reply, ws, r.locationId));
    if (replies.length) {
      await db.insert(t.reviewReply).values(replies);
    }
  }

  if (data.drafts.length) {
    await db
      .insert(t.reviewDraft)
      .values(data.drafts.map((d, i) => buildDraftRow(d, ws, data.location.id, i)));
  }

  if (data.tasks.length) {
    await db
      .insert(t.gbpTask)
      .values(data.tasks.map((tk, i) => buildTaskRow(tk, ws, i)));
  }

  if (data.campaigns.length) {
    await db
      .insert(t.campaign)
      .values(data.campaigns.map((c, i) => buildCampaignRow(c, ws, i)));
  }

  await db.insert(t.subscription).values(buildSubscriptionRow(data.subscription));

  // QR assets now live in their own table (unique slugs + atomic scans).
  if (data.qrAssets.length) {
    await db
      .insert(t.qrAsset)
      .values(data.qrAssets.map((q, i) => buildQrRow(q, ws, i)));
  }

  if (data.privateFeedback.length) {
    await db
      .insert(t.privateFeedback)
      .values(data.privateFeedback.map((p, i) => buildPrivateFeedbackRow(p, ws, i)));
  }

  if (data.notifications.length) {
    await db
      .insert(t.notification)
      .values(data.notifications.map((n, i) => buildNotificationRow(n, ws, i)));
  }

  if (data.auditLog.length) {
    await db
      .insert(t.auditLog)
      .values(data.auditLog.map((a, i) => buildAuditRow(a, i)));
  }

  if (data.mutationJobs.length) {
    await db.insert(t.profileMutationJob).values(data.mutationJobs.map(buildMutationJobRow));
  }

  await db.insert(t.datasetMeta).values(buildMetaRow(data));
}

// ── The provider ────────────────────────────────────────────
export const drizzleProvider: DataProvider = {
  backed: "postgres",

  async getData(workspaceId): Promise<FoundlyData | null> {
    const db = getDb();
    const [
      wsRows,
      orgRows,
      locRows,
      ownerRows,
      inviteRows,
      staffRows,
      customerRows,
      consentRows,
      requestRows,
      reviewRows,
      replyRows,
      draftRows,
      taskRows,
      campaignRows,
      subRows,
      pfRows,
      notifRows,
      auditRows,
      qrRows,
      mutationJobRows,
      metaRows,
    ] = await Promise.all([
      db.select().from(t.workspace).where(eq(t.workspace.id, workspaceId)).limit(1),
      db
        .select()
        .from(t.organization)
        .where(
          sql`${t.organization.id} = (select ${t.workspace.organizationId} from ${t.workspace} where ${t.workspace.id} = ${workspaceId})`,
        )
        .limit(1),
      db
        .select()
        .from(t.location)
        .where(eq(t.location.workspaceId, workspaceId))
        .limit(1),
      db
        .select()
        .from(t.appUser)
        .where(and(eq(t.appUser.workspaceId, workspaceId), eq(t.appUser.role, "owner")))
        .limit(1),
      db
        .select()
        .from(t.staffInvite)
        .where(eq(t.staffInvite.workspaceId, workspaceId))
        .orderBy(t.staffInvite.seq),
      db
        .select()
        .from(t.staffMember)
        .where(eq(t.staffMember.workspaceId, workspaceId))
        .orderBy(t.staffMember.seq),
      db
        .select()
        .from(t.customer)
        .where(eq(t.customer.workspaceId, workspaceId))
        .orderBy(t.customer.seq),
      db
        .select()
        .from(t.customerConsent)
        .where(eq(t.customerConsent.workspaceId, workspaceId)),
      db
        .select()
        .from(t.reviewRequest)
        .where(eq(t.reviewRequest.workspaceId, workspaceId))
        .orderBy(t.reviewRequest.seq),
      db
        .select()
        .from(t.review)
        .where(eq(t.review.workspaceId, workspaceId))
        .orderBy(t.review.seq),
      db
        .select()
        .from(t.reviewReply)
        .where(eq(t.reviewReply.workspaceId, workspaceId)),
      db
        .select()
        .from(t.reviewDraft)
        .where(eq(t.reviewDraft.workspaceId, workspaceId))
        .orderBy(t.reviewDraft.seq),
      db
        .select()
        .from(t.gbpTask)
        .where(eq(t.gbpTask.workspaceId, workspaceId))
        .orderBy(t.gbpTask.seq),
      db
        .select()
        .from(t.campaign)
        .where(eq(t.campaign.workspaceId, workspaceId))
        .orderBy(t.campaign.seq),
      db
        .select()
        .from(t.subscription)
        .where(eq(t.subscription.workspaceId, workspaceId))
        .limit(1),
      db
        .select()
        .from(t.privateFeedback)
        .where(eq(t.privateFeedback.workspaceId, workspaceId))
        .orderBy(t.privateFeedback.seq),
      db
        .select()
        .from(t.notification)
        .where(eq(t.notification.workspaceId, workspaceId))
        .orderBy(t.notification.seq),
      db
        .select()
        .from(t.auditLog)
        .where(eq(t.auditLog.workspaceId, workspaceId))
        .orderBy(t.auditLog.seq),
      db
        .select()
        .from(t.qrAsset)
        .where(eq(t.qrAsset.workspaceId, workspaceId))
        .orderBy(t.qrAsset.seq),
      db
        .select()
        .from(t.profileMutationJob)
        .where(eq(t.profileMutationJob.workspaceId, workspaceId))
        .orderBy(t.profileMutationJob.createdAt),
      db
        .select()
        .from(t.datasetMeta)
        .where(eq(t.datasetMeta.workspaceId, workspaceId))
        .limit(1),
    ]);

    const wsRow = wsRows[0];
    if (!wsRow) return null; // unknown workspace — not an error

    const meta = one(metaRows, `dataset_meta for workspace ${workspaceId}`);
    const consentByCustomer = new Map<string, ConsentRow>(
      consentRows.map((c) => [c.customerId, c]),
    );
    const replyByReview = new Map<string, ReplyRow>(
      replyRows.map((r) => [r.reviewId, r]),
    );

    return {
      organization: mapOrg(one(orgRows, "organization")),
      workspace: mapWorkspace(wsRow),
      location: mapLocation(one(locRows, "location")),
      owner: mapUser(one(ownerRows, "owner")),
      invites: inviteRows.map(mapInvite),
      staff: staffRows.map(mapStaff),
      customers: customerRows.map((c) =>
        mapCustomer(c, consentByCustomer.get(c.id)),
      ),
      requests: requestRows.map(mapRequest),
      reviews: reviewRows.map((r) => mapReview(r, replyByReview.get(r.id))),
      drafts: draftRows.map(mapDraft),
      tasks: taskRows.map(mapTask),
      mutationJobs: mutationJobRows.map(mapMutationJob),
      campaigns: campaignRows.map(mapCampaign),
      subscription: mapSubscription(one(subRows, "subscription")),
      invoices: meta.invoices,
      competitors: meta.competitors,
      metrics: meta.metrics,
      aeo: meta.aeo,
      rankScans: meta.rankScans,
      qrAssets: qrRows.map(mapQr),
      widgets: meta.widgets,
      milestones: meta.milestones,
      suppression: meta.suppression,
      integrations: meta.integrations,
      auditLog: auditRows.map(mapAudit),
      featureFlags: meta.featureFlags,
      notifications: notifRows.map(mapNotification),
      privateFeedback: pfRows.map(mapPrivateFeedback),
      reports: meta.reports,
      agency: meta.agency,
      platform: meta.platform,
    };
  },

  // ── Auth ──────────────────────────────────────────────────
  async listOrganizationWorkspaces(workspaceId) {
    const db = getDb();
    const currentRows = await db
      .select()
      .from(t.workspace)
      .where(eq(t.workspace.id, workspaceId))
      .limit(1);
    const current = currentRows[0];
    if (!current) return [];
    const workspaces = await db
      .select({ id: t.workspace.id })
      .from(t.workspace)
      .where(eq(t.workspace.organizationId, current.organizationId));
    const summaries = [];
    for (const workspace of workspaces) {
      const data = await drizzleProvider.getData(workspace.id);
      if (!data) continue;
      const latest = [...data.metrics].sort((a, b) => a.date.localeCompare(b.date)).pop();
      const trustedScore = data.workspace.isDemo || Boolean(latest?.sources?.scores);
      summaries.push({
        workspaceId: data.workspace.id,
        locationId: data.location.id,
        name: data.location.name,
        city: data.location.city,
        rating: data.location.rating,
        reviewCount: data.location.reviewCount,
        growthScore: trustedScore ? latest?.growthScore ?? null : null,
      });
    }
    return summaries;
  },

  async listAgencyClients(workspaceId) {
    const current = await drizzleProvider.getData(workspaceId);
    if (!current) return [];
    if (current.workspace.isDemo) return current.agency.clients;
    const siblingIds = new Set(
      (await drizzleProvider.listOrganizationWorkspaces(workspaceId)).map((item) => item.workspaceId),
    );
    const cutoff = Date.now() - 30 * 86_400_000;
    const clients = [];
    for (const stored of current.agency.clients) {
      const rows = await getDb()
        .select({ workspaceId: t.location.workspaceId })
        .from(t.location)
        .where(eq(t.location.id, stored.locationId))
        .limit(1);
      const childWorkspaceId = rows[0]?.workspaceId;
      if (!childWorkspaceId || !siblingIds.has(childWorkspaceId)) {
        clients.push(stored);
        continue;
      }
      const child = await drizzleProvider.getData(childWorkspaceId);
      if (!child) {
        clients.push(stored);
        continue;
      }
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
      clients.push({
        ...stored,
        name: child.location.name,
        city: child.location.city,
        growthScore,
        rating: child.location.rating,
        newReviews30d,
        needsReply,
        plan: child.subscription.tier,
        status,
      });
    }
    return clients;
  },

  async createOrganizationWorkspace(workspaceId, input) {
    const current = await drizzleProvider.getData(workspaceId);
    if (!current) return { ok: false, error: "Current workspace was not found." };
    const siblings = await drizzleProvider.listOrganizationWorkspaces(workspaceId);
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
    await createOrganizationLocation(getDb(), data);
    if (current.subscription.tier === "agency" && input.contactEmail) {
      const db = getDb();
      const metaRows = await db
        .select({ agency: t.datasetMeta.agency })
        .from(t.datasetMeta)
        .where(eq(t.datasetMeta.workspaceId, workspaceId))
        .limit(1);
      const agency = metaRows[0]?.agency;
      if (agency) {
        await db
          .update(t.datasetMeta)
          .set({
            agency: {
              ...agency,
              clients: [
                ...agency.clients,
                {
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
                },
              ],
            },
          })
          .where(eq(t.datasetMeta.workspaceId, workspaceId));
      }
    }
    const workspace = (await drizzleProvider.listOrganizationWorkspaces(nextWorkspaceId)).find(
      (item) => item.workspaceId === nextWorkspaceId,
    );
    return workspace
      ? { ok: true, workspace }
      : { ok: false, error: "The new location could not be loaded." };
  },

  async getReferralSummary(workspaceId) {
    const db = getDb();
    const referrals = await db
      .select()
      .from(t.workspace)
      .where(eq(t.workspace.referredByWorkspaceId, workspaceId));
    let qualified = 0;
    let applied = 0;
    for (const referral of referrals) {
      if (referral.referralRewardStatus === "applied") {
        applied += 1;
        qualified += 1;
        continue;
      }
      const subscriptions = await db
        .select({ status: t.subscription.status, tier: t.subscription.tier })
        .from(t.subscription)
        .where(eq(t.subscription.workspaceId, referral.id))
        .limit(1);
      if (subscriptions[0]?.status === "active" && subscriptions[0]?.tier !== "free") {
        qualified += 1;
      }
    }
    return {
      signedUp: referrals.length,
      qualified,
      creditsApplied: applied * 50,
      pendingCredits: (qualified - applied) * 50,
    };
  },

  async getPendingReferralReward(referredWorkspaceId) {
    const db = getDb();
    const referredRows = await db
      .select()
      .from(t.workspace)
      .where(eq(t.workspace.id, referredWorkspaceId))
      .limit(1);
    const referred = referredRows[0];
    if (!referred?.referredByWorkspaceId || referred.referralRewardStatus !== "pending") return null;
    const referredSubscriptions = await db
      .select()
      .from(t.subscription)
      .where(eq(t.subscription.workspaceId, referredWorkspaceId))
      .limit(1);
    const referredSubscription = referredSubscriptions[0];
    if (referredSubscription?.status !== "active" || referredSubscription.tier === "free") return null;
    const referrerSubscriptions = await db
      .select()
      .from(t.subscription)
      .where(eq(t.subscription.workspaceId, referred.referredByWorkspaceId))
      .limit(1);
    const referrerSubscription = referrerSubscriptions[0];
    if (!referrerSubscription?.stripeCustomerId) return null;
    return {
      referredWorkspaceId,
      referrerWorkspaceId: referred.referredByWorkspaceId,
      stripeCustomerId: referrerSubscription.stripeCustomerId,
      currency: referrerSubscription.currency as "USD" | "CAD",
    };
  },

  async markReferralRewardApplied(referredWorkspaceId, appliedAt) {
    await getDb()
      .update(t.workspace)
      .set({ referralRewardStatus: "applied", referralRewardAppliedAt: appliedAt })
      .where(
        and(
          eq(t.workspace.id, referredWorkspaceId),
          eq(t.workspace.referralRewardStatus, "pending"),
        ),
      );
  },

  async registerUser(input: RegisterInput): Promise<RegisterResult> {
    // Self-initialize the schema on first real signup (no terminal needed).
    const schema = await ensureSchema();
    if (!schema.ok) {
      return {
        ok: false,
        error:
          "The database isn't ready yet. Visit /setup to initialize it, or try again in a moment.",
      };
    }
    const db = getDb();
    const email = input.email.trim().toLowerCase();
    const existing = await findUserRowByEmail(db, email);
    if (existing) {
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
    if (input.referredByWorkspaceId) {
      const referrer = await db
        .select({ id: t.workspace.id })
        .from(t.workspace)
        .where(eq(t.workspace.id, input.referredByWorkspaceId))
        .limit(1);
      if (referrer[0]) {
        data.workspace.referredByWorkspaceId = input.referredByWorkspaceId;
        data.workspace.referralRewardStatus = "pending";
      }
    }
    await createWorkspaceWithOwner(db, data, { passwordHash });

    return {
      ok: true,
      user: {
        id: userId,
        name: input.name,
        email,
        role: "owner",
        workspaceId,
        isDemo: false,
      },
    };
  },

  async verifyCredentials(email, password) {
    const db = getDb();
    const user = await findUserRowByEmail(db, email);
    if (!user?.passwordHash) return null;
    const ok = await verifyPassword(password, user.passwordHash);
    return ok ? toAuthUser(user) : null;
  },

  async getUserByEmail(email) {
    const db = getDb();
    const user = await findUserRowByEmail(db, email);
    return user ? toAuthUser(user) : null;
  },

  async savePasswordResetToken(input) {
    const db = getDb();
    // One active link per user. Issuing a new link invalidates every older one.
    await db.delete(t.passwordResetToken).where(eq(t.passwordResetToken.userId, input.userId));
    await db.insert(t.passwordResetToken).values({
      tokenHash: input.tokenHash,
      userId: input.userId,
      expiresAt: input.expiresAt,
      createdAt: input.createdAt,
      usedAt: null,
    });
  },

  async revokePasswordResetToken(tokenHash) {
    const db = getDb();
    await db.delete(t.passwordResetToken).where(eq(t.passwordResetToken.tokenHash, tokenHash));
  },

  async consumePasswordResetToken(tokenHash, passwordHash, consumedAt) {
    const db = getDb();
    // Claim first with a conditional update, so concurrent submissions cannot
    // use the same reset link twice.
    const claimed = await db
      .update(t.passwordResetToken)
      .set({ usedAt: consumedAt })
      .where(
        and(
          eq(t.passwordResetToken.tokenHash, tokenHash),
          isNull(t.passwordResetToken.usedAt),
          gt(t.passwordResetToken.expiresAt, consumedAt),
        ),
      )
      .returning({ userId: t.passwordResetToken.userId });
    const userId = claimed[0]?.userId;
    if (!userId) return false;
    // Set the new password AND revoke every outstanding session (V8): a reset is
    // the standard "I've been compromised" remediation, so old JWTs must die.
    await db
      .update(t.appUser)
      .set({ passwordHash, sessionVersion: sql`${t.appUser.sessionVersion} + 1` })
      .where(eq(t.appUser.id, userId));
    await db.delete(t.passwordResetToken).where(eq(t.passwordResetToken.userId, userId));
    return true;
  },

  async getUserSessionVersion(userId) {
    const rows = await getDb()
      .select({ sessionVersion: t.appUser.sessionVersion })
      .from(t.appUser)
      .where(eq(t.appUser.id, userId))
      .limit(1);
    return rows[0] ? rows[0].sessionVersion ?? 0 : null;
  },

  async bumpUserSessionVersion(userId) {
    await getDb()
      .update(t.appUser)
      .set({ sessionVersion: sql`${t.appUser.sessionVersion} + 1` })
      .where(eq(t.appUser.id, userId));
  },

  async setEmailVerified(userId, verified) {
    await getDb()
      .update(t.appUser)
      .set({ emailVerified: verified })
      .where(eq(t.appUser.id, userId));
  },

  async isWorkspaceEmailVerified(workspaceId) {
    const rows = await getDb()
      .select({ emailVerified: t.appUser.emailVerified })
      .from(t.appUser)
      .where(and(eq(t.appUser.workspaceId, workspaceId), eq(t.appUser.role, "owner")))
      .limit(1);
    // Fail open when there is no owner row to check.
    return rows[0] ? rows[0].emailVerified : true;
  },

  async upsertGoogleUser({ googleSub, email, name, referredByWorkspaceId }) {
    const db = getDb();
    const key = email.trim().toLowerCase();
    const existing = await findUserRowByEmail(db, key);
    if (existing) {
      await db
        .update(t.appUser)
        .set({ googleSub, emailVerified: true })
        .where(eq(t.appUser.id, existing.id));
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
    if (referredByWorkspaceId) {
      const referrer = await db
        .select({ id: t.workspace.id })
        .from(t.workspace)
        .where(eq(t.workspace.id, referredByWorkspaceId))
        .limit(1);
      if (referrer[0]) {
        data.workspace.referredByWorkspaceId = referredByWorkspaceId;
        data.workspace.referralRewardStatus = "pending";
      }
    }
    await createWorkspaceWithOwner(db, data, { googleSub });
    return {
      id: userId,
      name: name || key,
      email: key,
      role: "owner",
      workspaceId,
      isDemo: false,
    };
  },

  // ── Focused reads ─────────────────────────────────────────
  async getCustomer(workspaceId, customerId) {
    const db = getDb();
    const custRows = await db
      .select()
      .from(t.customer)
      .where(and(eq(t.customer.id, customerId), eq(t.customer.workspaceId, workspaceId)))
      .limit(1);
    const cust = custRows[0];
    if (!cust) return null;
    const consRows = await db
      .select()
      .from(t.customerConsent)
      .where(
        and(
          eq(t.customerConsent.customerId, customerId),
          eq(t.customerConsent.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    return mapCustomer(cust, consRows[0]);
  },

  async getRequestByToken(token) {
    // Global by token (tokens are unguessable public identifiers).
    const db = getDb();
    const reqRows = await db
      .select()
      .from(t.reviewRequest)
      .where(eq(t.reviewRequest.token, token))
      .limit(1);
    const req = reqRows[0];
    if (!req) return null;
    // Resolve the request's OWN location — never "any" location row.
    const locRows = await db
      .select()
      .from(t.location)
      .where(
        and(
          eq(t.location.id, req.locationId),
          eq(t.location.workspaceId, req.workspaceId),
        ),
      )
      .limit(1);
    const loc = locRows[0];
    if (!loc) return null;
    return { request: mapRequest(req), location: mapLocation(loc) };
  },

  // ── Core loop mutations ───────────────────────────────────
  async captureCustomer(workspaceId, input: CaptureCustomerInput) {
    const db = getDb();
    const ctx = await loadContext(db, workspaceId);
    const now = nowIso();
    const seq = front();

    const consent: CustomerConsent = {
      serviceConsent: input.serviceConsent,
      serviceConsentAt: input.serviceConsent ? now : undefined,
      marketingConsent: input.marketingConsent,
      marketingConsentAt: input.marketingConsent ? now : undefined,
      consentChannel: "in_person",
      consentSourceText: input.consentSourceText,
      caslCaptured: ctx.location.region === "CA",
    };
    const customer: Customer = {
      id: id("cus"),
      locationId: ctx.location.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      createdAt: now,
      source: "staff",
      staffId: input.staffId,
      visitCount: 1,
      lastVisitAt: now,
      lastRequestAt: undefined,
      services: input.services,
      sentiment: "neutral",
      lifecycleStage: "new",
      consent,
      tags: [],
    };
    const request: ReviewRequest = {
      id: id("req"),
      locationId: ctx.location.id,
      customerId: customer.id,
      customerName: customer.name,
      staffId: input.staffId,
      channel: input.channel,
      token: id("tok"),
      status: "queued",
      isTest: false,
      createdAt: now,
      sentAt: undefined,
      attributes: [],
    };

    await db.insert(t.customer).values(buildCustomerRow(customer, workspaceId, seq));
    await db
      .insert(t.customerConsent)
      .values(buildConsentRow(customer.id, customer.locationId, workspaceId, consent));
    await db.insert(t.reviewRequest).values(buildRequestRow(request, workspaceId, seq));

    // Attribution + streak activity bump (workspace-scoped).
    let actor = "Owner";
    if (input.staffId) {
      const staffRows = await db
        .select()
        .from(t.staffMember)
        .where(
          and(
            eq(t.staffMember.id, input.staffId),
            eq(t.staffMember.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      const staff = staffRows[0];
      if (staff) {
        actor = staff.displayName;
        await db
          .update(t.staffMember)
          .set({ captures: staff.captures + 1, lastActiveAt: now })
          .where(
            and(
              eq(t.staffMember.id, staff.id),
              eq(t.staffMember.workspaceId, workspaceId),
            ),
          );
      }
    }

    await db.insert(t.auditLog).values({
      id: id("aud"),
      workspaceId,
      actor,
      action: "customer.captured",
      targetType: "customer",
      targetId: customer.id,
      at: now,
      seq,
    });

    return { customer, request };
  },

  async addCustomer(workspaceId, input: AddCustomerInput) {
    const db = getDb();
    const ctx = await loadContext(db, workspaceId);
    const now = nowIso();
    const seq = front();

    const consent: CustomerConsent = {
      serviceConsent: input.serviceConsent,
      serviceConsentAt: input.serviceConsent ? now : undefined,
      marketingConsent: input.marketingConsent,
      marketingConsentAt: input.marketingConsent ? now : undefined,
      consentChannel: "in_person",
      consentSourceText: input.consentSourceText,
      caslCaptured: ctx.location.region === "CA",
    };
    const customer: Customer = {
      id: id("cus"),
      locationId: ctx.location.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      createdAt: now,
      source: "walk_in",
      visitCount: 1,
      lastVisitAt: now,
      services: input.services,
      sentiment: "neutral",
      lifecycleStage: "new",
      consent,
      tags: [],
    };

    await db.insert(t.customer).values(buildCustomerRow(customer, workspaceId, seq));
    await db
      .insert(t.customerConsent)
      .values(buildConsentRow(customer.id, customer.locationId, workspaceId, consent));

    await db.insert(t.auditLog).values({
      id: id("aud"),
      workspaceId,
      actor: "Owner",
      action: "customer.added",
      targetType: "customer",
      targetId: customer.id,
      at: now,
      seq,
    });

    return customer;
  },

  async addCustomersBulk(workspaceId, inputs: AddCustomerInput[]) {
    const db = getDb();
    // Seed the de-dupe set from existing customer emails, then grow it as we
    // insert so duplicates within the same batch are skipped too.
    const existing = await db
      .select({ email: t.customer.email })
      .from(t.customer)
      .where(eq(t.customer.workspaceId, workspaceId));
    const seen = new Set<string>();
    for (const row of existing) {
      if (row.email) seen.add(row.email.trim().toLowerCase());
    }

    let added = 0;
    let skipped = 0;
    for (const input of inputs) {
      const email = input.email?.trim().toLowerCase();
      if (email && seen.has(email)) {
        skipped += 1;
        continue;
      }
      await drizzleProvider.addCustomer(workspaceId, input);
      if (email) seen.add(email);
      added += 1;
    }
    return { added, skipped };
  },

  async sendRequest(workspaceId, input: SendRequestInput) {
    const db = getDb();
    const ctx = await loadContext(db, workspaceId);
    const now = nowIso();
    const seq = front();

    const custRows = await db
      .select()
      .from(t.customer)
      .where(
        and(
          eq(t.customer.id, input.customerId),
          eq(t.customer.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    const customer = custRows[0];

    const request: ReviewRequest = {
      id: id("req"),
      locationId: ctx.location.id,
      customerId: input.customerId,
      customerName: customer?.name ?? "Customer",
      staffId: input.staffId,
      channel: input.channel,
      token: id("tok"),
      status: "queued",
      isTest: false,
      createdAt: now,
      sentAt: undefined,
      attributes: [],
    };
    await db.insert(t.reviewRequest).values(buildRequestRow(request, workspaceId, seq));

    return request;
  },

  async setRequestDeliveryStatus(workspaceId, requestId, status, reason) {
    const db = getDb();
    const rows = await db
      .select()
      .from(t.reviewRequest)
      .where(
        and(
          eq(t.reviewRequest.id, requestId),
          eq(t.reviewRequest.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    const current = rows[0];
    if (!current) return null;

    const accepted = status === "sent" || status === "delivered";
    const sentAt = accepted ? current.sentAt ?? nowIso() : current.sentAt;
    await db
      .update(t.reviewRequest)
      .set({ status, sentAt, suppressedReason: reason ?? current.suppressedReason })
      .where(
        and(
          eq(t.reviewRequest.id, requestId),
          eq(t.reviewRequest.workspaceId, workspaceId),
        ),
      );

    if (accepted && !current.sentAt) {
      await bumpUsage(db, workspaceId, (usage) => ({
        ...usage,
        requestsSent: usage.requestsSent + 1,
        smsCreditsUsed:
          current.channel === "sms" ? usage.smsCreditsUsed + 1 : usage.smsCreditsUsed,
      }));
      const customerRows = await db
        .select()
        .from(t.customer)
        .where(
          and(
            eq(t.customer.id, current.customerId),
            eq(t.customer.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      const customer = customerRows[0];
      await db
        .update(t.customer)
        .set({
          lastRequestAt: sentAt,
          lifecycleStage:
            customer?.lifecycleStage === "new" ? "requested" : customer?.lifecycleStage,
        })
        .where(
          and(
            eq(t.customer.id, current.customerId),
            eq(t.customer.workspaceId, workspaceId),
          ),
        );
    }

    return mapRequest({
      ...current,
      status,
      sentAt,
      suppressedReason: reason ?? current.suppressedReason,
    });
  },

  async suppressPhoneGlobally(phone, reason) {
    const needle = canonicalPhone(phone);
    if (!needle) return 0;
    const db = getDb();
    const customers = (await db.select().from(t.customer)).filter(
      (customer) => canonicalPhone(customer.phone ?? undefined) === needle,
    );
    const byWorkspace = new Map<string, typeof customers>();
    for (const customer of customers) {
      const list = byWorkspace.get(customer.workspaceId) ?? [];
      list.push(customer);
      byWorkspace.set(customer.workspaceId, list);
    }
    const at = nowIso();
    for (const [workspaceId, matches] of byWorkspace) {
      const meta = one(
        await db.select().from(t.datasetMeta).where(eq(t.datasetMeta.workspaceId, workspaceId)).limit(1),
        `dataset_meta for workspace ${workspaceId}`,
      );
      const alreadySuppressed = meta.suppression.some(
        (entry) => entry.matchType === "phone" && canonicalPhone(entry.value) === needle,
      );
      if (!alreadySuppressed) {
        await db
          .update(t.datasetMeta)
          .set({
            suppression: [
              {
                id: id("sup"),
                locationId: matches[0]!.locationId,
                matchType: "phone" as const,
                value: needle,
                reason,
                addedAt: at,
              },
              ...meta.suppression,
            ],
          })
          .where(eq(t.datasetMeta.workspaceId, workspaceId));
      }
      for (const customer of matches) {
        await db
          .update(t.customer)
          .set({ suppressedReason: reason })
          .where(and(eq(t.customer.id, customer.id), eq(t.customer.workspaceId, workspaceId)));
        await db
          .update(t.customerConsent)
          .set({ serviceConsent: false, marketingConsent: false, withdrawnAt: at })
          .where(
            and(
              eq(t.customerConsent.customerId, customer.id),
              eq(t.customerConsent.workspaceId, workspaceId),
            ),
          );
      }
    }
    return customers.length;
  },

  async advanceRequest(token, to, meta) {
    // Token-keyed global lookup; every write below is scoped to the found
    // request's OWN workspace.
    const db = getDb();
    const reqRows = await db
      .select()
      .from(t.reviewRequest)
      .where(eq(t.reviewRequest.token, token))
      .limit(1);
    const req = reqRows[0];
    if (!req) return null;
    const ws = req.workspaceId;
    const now = nowIso();

    const set: Partial<typeof t.reviewRequest.$inferInsert> = { status: to };
    if (to === "opened") set.openedAt = now;
    if (to === "clicked" || to === "posted_google" || to === "private_feedback") {
      set.clickedAt = req.clickedAt ?? now;
    }
    if (meta?.rating) set.rating = meta.rating;
    if (meta?.attributes) set.attributes = meta.attributes;
    await db
      .update(t.reviewRequest)
      .set(set)
      .where(and(eq(t.reviewRequest.id, req.id), eq(t.reviewRequest.workspaceId, ws)));

    const custRows = await db
      .select()
      .from(t.customer)
      .where(and(eq(t.customer.id, req.customerId), eq(t.customer.workspaceId, ws)))
      .limit(1);
    const customer = custRows[0];
    if (customer) {
      const custSet: Partial<typeof t.customer.$inferInsert> = {};
      if (to === "opened" && customer.lifecycleStage === "requested") {
        custSet.lifecycleStage = "opened";
      }
      if (to === "posted_google") {
        custSet.lifecycleStage = "reviewed";
        custSet.sentiment = "happy";
      }
      if (to === "private_feedback") {
        custSet.sentiment = "unhappy";
      }
      if (Object.keys(custSet).length > 0) {
        await db
          .update(t.customer)
          .set(custSet)
          .where(and(eq(t.customer.id, customer.id), eq(t.customer.workspaceId, ws)));
      }
    }

    if (to === "posted_google") {
      if (req.staffId) {
        const staffRows = await db
          .select()
          .from(t.staffMember)
          .where(
            and(eq(t.staffMember.id, req.staffId), eq(t.staffMember.workspaceId, ws)),
          )
          .limit(1);
        const staff = staffRows[0];
        if (staff) {
          await db
            .update(t.staffMember)
            .set({ detectedReviews: staff.detectedReviews + 1 })
            .where(
              and(eq(t.staffMember.id, staff.id), eq(t.staffMember.workspaceId, ws)),
            );
        }
      }
      await bumpUsage(db, ws, (u) => ({
        ...u,
        reviewsCaptured: u.reviewsCaptured + 1,
      }));
    }

    const updatedRows = await db
      .select()
      .from(t.reviewRequest)
      .where(and(eq(t.reviewRequest.id, req.id), eq(t.reviewRequest.workspaceId, ws)))
      .limit(1);
    const updated = updatedRows[0];
    return updated ? mapRequest(updated) : null;
  },

  async submitPrivateFeedback(input: SubmitPrivateFeedbackInput) {
    // Token-keyed global lookup; writes are scoped to the request's workspace.
    const db = getDb();
    const now = nowIso();
    const reqRows = await db
      .select()
      .from(t.reviewRequest)
      .where(eq(t.reviewRequest.token, input.token))
      .limit(1);
    const req = reqRows[0];

    if (!req) {
      // Token not found — record nothing, but return a shell so the customer
      // flow never dead-ends (mirrors the memory provider).
      return {
        id: id("pf"),
        locationId: "unknown",
        customerName: "Customer",
        rating: input.rating,
        text: input.text,
        createdAt: now,
        resolved: false,
      };
    }

    const ws = req.workspaceId;
    const seq = front();
    const fb: PrivateFeedback = {
      id: id("pf"),
      locationId: req.locationId,
      customerName: req.customerName,
      rating: input.rating,
      text: input.text,
      createdAt: now,
      resolved: false,
    };
    await db.insert(t.privateFeedback).values(buildPrivateFeedbackRow(fb, ws, seq));

    await db
      .update(t.reviewRequest)
      .set({
        status: "private_feedback",
        rating: input.rating,
        privateFeedback: input.text,
      })
      .where(and(eq(t.reviewRequest.id, req.id), eq(t.reviewRequest.workspaceId, ws)));

    await db.insert(t.notification).values({
      id: id("ntf"),
      workspaceId: ws,
      locationId: req.locationId,
      kind: "feedback",
      title: "Private feedback needs attention",
      body: `A ${input.rating}-star private note came in from ${req.customerName}.`,
      createdAt: now,
      read: false,
      seq,
    });

    return fb;
  },

  async resolvePrivateFeedback(workspaceId, feedbackId) {
    const db = getDb();
    await db
      .update(t.privateFeedback)
      .set({ resolved: true })
      .where(
        and(
          eq(t.privateFeedback.id, feedbackId),
          eq(t.privateFeedback.workspaceId, workspaceId),
        ),
      );
  },

  async recordDraft(workspaceId, input: RecordDraftInput) {
    const db = getDb();
    const ctx = await loadContext(db, workspaceId);
    const now = nowIso();
    const seq = front();

    const draft: ReviewDraft = {
      id: id("draft"),
      requestId: input.requestId,
      reviewId: input.reviewId,
      kind: input.kind,
      variants: input.variants,
      generatedBy: input.generatedBy,
      createdAt: now,
    };
    await db
      .insert(t.reviewDraft)
      .values(buildDraftRow(draft, workspaceId, ctx.location.id, seq));

    await bumpUsage(db, workspaceId, (u) => ({
      ...u,
      aiDraftsUsed: u.aiDraftsUsed + 1,
    }));

    return draft;
  },

  async approveTask(workspaceId, taskId) {
    const db = getDb();
    const now = nowIso();

    const taskRows = await db
      .select()
      .from(t.gbpTask)
      .where(and(eq(t.gbpTask.id, taskId), eq(t.gbpTask.workspaceId, workspaceId)))
      .limit(1);
    const task = taskRows[0];
    if (!task) return null;

    await db
      .update(t.gbpTask)
      .set({ status: "done" })
      .where(and(eq(t.gbpTask.id, task.id), eq(t.gbpTask.workspaceId, workspaceId)));

    await db.insert(t.auditLog).values({
      id: id("aud"),
      workspaceId,
      actor: "Owner",
      action: "task.completed",
      targetType: "gbp_task",
      targetId: task.id,
      at: now,
      seq: front(),
    });

    return mapTask({ ...task, status: "done" });
  },

  async snoozeTask(workspaceId, taskId) {
    const db = getDb();
    const taskRows = await db
      .select()
      .from(t.gbpTask)
      .where(and(eq(t.gbpTask.id, taskId), eq(t.gbpTask.workspaceId, workspaceId)))
      .limit(1);
    const task = taskRows[0];
    if (!task) return null;
    await db
      .update(t.gbpTask)
      .set({ status: "snoozed" })
      .where(and(eq(t.gbpTask.id, task.id), eq(t.gbpTask.workspaceId, workspaceId)));
    return mapTask({ ...task, status: "snoozed" });
  },

  async createGbpTask(workspaceId, input: CreateTaskInput) {
    const db = getDb();
    const ctx = await loadContext(db, workspaceId);
    const now = nowIso();

    const task: GbpTask = {
      id: id("task"),
      locationId: ctx.location.id,
      isoWeek: "",
      kind: input.kind,
      title: input.title,
      rationale: input.rationale,
      preview: input.preview,
      status: "suggested",
      impact: input.impact,
      effortMins: 2,
      createdAt: now,
    };
    await db.insert(t.gbpTask).values(buildTaskRow(task, workspaceId, front()));
    return task;
  },

  async postReply(workspaceId, input: PostReplyInput) {
    const db = getDb();
    const now = nowIso();

    const revRows = await db
      .select()
      .from(t.review)
      .where(and(eq(t.review.id, input.reviewId), eq(t.review.workspaceId, workspaceId)))
      .limit(1);
    const rev = revRows[0];
    if (!rev) return null;

    const reply: ReviewReply = {
      id: id("rpl"),
      text: input.text,
      tone: input.tone,
      source: "ai",
      postedAt: now,
      approvedBy: "Owner",
    };
    const replyRow = buildReplyRow(rev.id, reply, workspaceId, rev.locationId);
    await db
      .insert(t.reviewReply)
      .values(replyRow)
      .onConflictDoUpdate({
        target: t.reviewReply.reviewId,
        set: {
          id: reply.id,
          text: reply.text,
          tone: reply.tone,
          source: reply.source,
          postedAt: reply.postedAt,
          approvedBy: reply.approvedBy,
        },
      });

    await db
      .update(t.review)
      .set({ needsReply: false })
      .where(and(eq(t.review.id, rev.id), eq(t.review.workspaceId, workspaceId)));

    await db.insert(t.auditLog).values({
      id: id("aud"),
      workspaceId,
      actor: "Owner",
      action: "review.reply_saved",
      targetType: "review",
      targetId: rev.id,
      at: now,
      seq: front(),
    });

    return mapReview({ ...rev, needsReply: false }, replyRow);
  },

  async createCampaign(workspaceId, input: CreateCampaignInput) {
    const db = getDb();
    const ctx = await loadContext(db, workspaceId);
    const now = nowIso();

    const customerRows = await db
      .select()
      .from(t.customer)
      .where(eq(t.customer.workspaceId, workspaceId));
    const consentRows = await db
      .select()
      .from(t.customerConsent)
      .where(eq(t.customerConsent.workspaceId, workspaceId));
    const consentByCustomer = new Map<string, ConsentRow>(
      consentRows.map((c) => [c.customerId, c]),
    );

    const pool = customerRows.filter((c) => {
      const cons = consentByCustomer.get(c.id);
      if (!cons) return false;
      return input.consentBasis === "marketing"
        ? cons.marketingConsent && !cons.withdrawnAt
        : cons.serviceConsent;
    });
    const total = customerRows.length;
    const consented = pool.length;

    const campaign: Campaign = {
      id: id("camp"),
      locationId: ctx.location.id,
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
          reason:
            input.consentBasis === "marketing"
              ? "Not opted in to marketing"
              : "No service consent",
          count: total - consented,
        },
      ],
      stats: { sent: 0, opened: 0, clicked: 0 },
      createdAt: now,
    };
    await db.insert(t.campaign).values(buildCampaignRow(campaign, workspaceId, front()));

    return campaign;
  },

  async setCampaignStatus(workspaceId, campaignId, status) {
    const db = getDb();
    await db
      .update(t.campaign)
      .set({ status })
      .where(
        and(eq(t.campaign.id, campaignId), eq(t.campaign.workspaceId, workspaceId)),
      );
  },

  async updateConsent(workspaceId, customerId, consent) {
    const db = getDb();
    const custRows = await db
      .select()
      .from(t.customer)
      .where(and(eq(t.customer.id, customerId), eq(t.customer.workspaceId, workspaceId)))
      .limit(1);
    const cust = custRows[0];
    if (!cust) return null;

    const consRows = await db
      .select()
      .from(t.customerConsent)
      .where(
        and(
          eq(t.customerConsent.customerId, customerId),
          eq(t.customerConsent.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    const cons = consRows[0];
    if (!cons) return null;

    const merged: CustomerConsent = { ...mapConsent(cons), ...consent };
    const mergedRow: ConsentRow = {
      ...cons,
      serviceConsent: merged.serviceConsent,
      serviceConsentAt: merged.serviceConsentAt ?? null,
      marketingConsent: merged.marketingConsent,
      marketingConsentAt: merged.marketingConsentAt ?? null,
      consentChannel: merged.consentChannel,
      consentSourceText: merged.consentSourceText,
      caslCaptured: merged.caslCaptured,
      withdrawnAt: merged.withdrawnAt ?? null,
    };
    await db
      .update(t.customerConsent)
      .set({
        serviceConsent: mergedRow.serviceConsent,
        serviceConsentAt: mergedRow.serviceConsentAt,
        marketingConsent: mergedRow.marketingConsent,
        marketingConsentAt: mergedRow.marketingConsentAt,
        consentChannel: mergedRow.consentChannel,
        consentSourceText: mergedRow.consentSourceText,
        caslCaptured: mergedRow.caslCaptured,
        withdrawnAt: mergedRow.withdrawnAt,
      })
      .where(
        and(
          eq(t.customerConsent.customerId, customerId),
          eq(t.customerConsent.workspaceId, workspaceId),
        ),
      );

    return mapCustomer(cust, mergedRow);
  },

  // ── QR ────────────────────────────────────────────────────
  async getWorkspaceIdBySlug(slug) {
    const db = getDb();
    const rows = await db
      .select({ ws: t.qrAsset.workspaceId })
      .from(t.qrAsset)
      .where(eq(t.qrAsset.slug, slug))
      .limit(1);
    return rows[0]?.ws ?? null;
  },

  async mintRequestFromQrSlug(slug) {
    // Slug-keyed global lookup (slugs are globally unique); all writes are
    // scoped to the asset's OWN workspace.
    const db = getDb();
    const assetRows = await db
      .select()
      .from(t.qrAsset)
      .where(eq(t.qrAsset.slug, slug))
      .limit(1);
    const asset = assetRows[0];
    if (!asset) return null;
    if (asset.degraded) return null;
    const ws = asset.workspaceId;
    const now = nowIso();
    const seq = front();

    // Atomic in-database increments — no read-modify-write race.
    await db
      .update(t.qrAsset)
      .set({
        scans: sql`${t.qrAsset.scans} + 1`,
        pageOpens: sql`${t.qrAsset.pageOpens} + 1`,
      })
      .where(and(eq(t.qrAsset.id, asset.id), eq(t.qrAsset.workspaceId, ws)));

    const locRows = await db
      .select()
      .from(t.location)
      .where(and(eq(t.location.id, asset.locationId), eq(t.location.workspaceId, ws)))
      .limit(1);
    const loc = locRows[0];
    if (!loc) return null;

    const consent: CustomerConsent = {
      // Self-initiated scan: no contact captured, no messaging consent
      // implied — nothing will ever be sent to this record.
      serviceConsent: false,
      marketingConsent: false,
      consentChannel: "in_person",
      consentSourceText: "Self-initiated in-store QR scan — no contact captured.",
      caslCaptured: false,
    };
    const customer: Customer = {
      id: id("cus"),
      locationId: loc.id,
      name: "Walk-in customer",
      createdAt: now,
      source: "walk_in",
      staffId: asset.staffId ?? undefined,
      visitCount: 1,
      lastVisitAt: now,
      services: [],
      sentiment: "neutral",
      lifecycleStage: "requested",
      consent,
      tags: ["QR scan"],
    };
    const request: ReviewRequest = {
      id: id("req"),
      locationId: loc.id,
      customerId: customer.id,
      customerName: customer.name,
      staffId: asset.staffId ?? undefined,
      channel: "email",
      token: id("tok"),
      status: "opened",
      isTest: false,
      createdAt: now,
      sentAt: now,
      openedAt: now,
      attributes: [],
    };

    await db.insert(t.customer).values(buildCustomerRow(customer, ws, seq));
    await db
      .insert(t.customerConsent)
      .values(buildConsentRow(customer.id, customer.locationId, ws, consent));
    await db.insert(t.reviewRequest).values(buildRequestRow(request, ws, seq));

    return { token: request.token, business: loc.name };
  },

  // ── Workspace configuration ───────────────────────────────
  async updateIndustry(workspaceId, industryKey, config) {
    const db = getDb();
    const wsSet: Partial<typeof t.workspace.$inferInsert> = { vertical: industryKey };
    if (config) wsSet.industryConfig = config;
    await db.update(t.workspace).set(wsSet).where(eq(t.workspace.id, workspaceId));
    await db
      .update(t.location)
      .set({ vertical: industryKey })
      .where(eq(t.location.workspaceId, workspaceId));
  },

  async updateWorkspaceSettings(workspaceId, patch) {
    const db = getDb();
    const wsRow = one(
      await db.select().from(t.workspace).where(eq(t.workspace.id, workspaceId)).limit(1),
      `workspace ${workspaceId}`,
    );
    const settings: WorkspaceSettings = {
      serviceConsentDefault: true,
      marketingOptInVisible: true,
      quietHours: true,
      leaderboardVisible: true,
      ...(wsRow.settings ?? {}),
      ...patch,
    };
    await db.update(t.workspace).set({ settings }).where(eq(t.workspace.id, workspaceId));
  },

  async updateLocationGoogle(workspaceId, patch: GoogleLocationPatch) {
    const db = getDb();
    const ctx = await loadContext(db, workspaceId);
    const reviewUrl = `https://search.google.com/local/writereview?placeid=${patch.placeId}`;

    const set: Partial<typeof t.location.$inferInsert> = {
      googlePlaceId: patch.placeId,
      reviewUrl,
    };
    if (patch.name) set.name = patch.name;
    if (patch.address) set.address = patch.address;
    if (patch.city) set.city = patch.city;
    if (typeof patch.rating === "number") set.rating = patch.rating;
    if (typeof patch.reviewCount === "number") set.reviewCount = patch.reviewCount;
    if (patch.category) {
      set.category = patch.category;
      set.profilePrimaryCategory = patch.category;
    }
    await db
      .update(t.location)
      .set(set)
      .where(
        and(
          eq(t.location.id, ctx.location.id),
          eq(t.location.workspaceId, workspaceId),
        ),
      );

    // Update QR targets to the (now real) Google review URL.
    await db
      .update(t.qrAsset)
      .set({ targetUrl: reviewUrl })
      .where(eq(t.qrAsset.workspaceId, workspaceId));

    // Mark the google_places integration connected (JSONB read-modify-write).
    const metaRows = await db
      .select()
      .from(t.datasetMeta)
      .where(eq(t.datasetMeta.workspaceId, workspaceId))
      .limit(1);
    const meta = metaRows[0];
    if (meta) {
      const integrations = meta.integrations.map((i) =>
        i.provider === "google_places"
          ? {
              ...i,
              status: "connected" as const,
              detail: "Business matched on Google",
              lastSyncAt: nowIso(),
            }
          : i,
      );
      await db
        .update(t.datasetMeta)
        .set({ integrations })
        .where(eq(t.datasetMeta.workspaceId, workspaceId));
    }
  },

  async saveRankGridScan(workspaceId, scan) {
    const db = getDb();
    const rows = await db
      .select({ rankScans: t.datasetMeta.rankScans })
      .from(t.datasetMeta)
      .where(eq(t.datasetMeta.workspaceId, workspaceId))
      .limit(1);
    const current = rows[0]?.rankScans ?? [];
    await db
      .update(t.datasetMeta)
      .set({
        rankScans: [scan, ...current.filter((item) => item.id !== scan.id)].slice(0, 24),
      })
      .where(eq(t.datasetMeta.workspaceId, workspaceId));
  },

  async markAgencyReportsSent(workspaceId, locationIds, sentAt) {
    const db = getDb();
    const rows = await db
      .select({ agency: t.datasetMeta.agency })
      .from(t.datasetMeta)
      .where(eq(t.datasetMeta.workspaceId, workspaceId))
      .limit(1);
    const agency = rows[0]?.agency;
    if (!agency) return;
    const selected = new Set(locationIds);
    await db
      .update(t.datasetMeta)
      .set({
        agency: {
          ...agency,
          clients: agency.clients.map((client) =>
            selected.has(client.locationId) ? { ...client, lastReportSent: sentAt } : client,
          ),
        },
      })
      .where(eq(t.datasetMeta.workspaceId, workspaceId));
  },

  async updateWhiteLabel(workspaceId, config) {
    const db = getDb();
    const metaRows = await db
      .select()
      .from(t.datasetMeta)
      .where(eq(t.datasetMeta.workspaceId, workspaceId))
      .limit(1);
    const meta = metaRows[0];
    if (meta) {
      await db
        .update(t.datasetMeta)
        .set({ agency: { ...meta.agency, whiteLabel: config } })
        .where(eq(t.datasetMeta.workspaceId, workspaceId));
    }
    // Mirror memory: only overwrite workspace.whiteLabel when already set.
    const wsRows = await db
      .select()
      .from(t.workspace)
      .where(eq(t.workspace.id, workspaceId))
      .limit(1);
    const wsRow = wsRows[0];
    if (wsRow?.whiteLabel) {
      await db
        .update(t.workspace)
        .set({ whiteLabel: config })
        .where(eq(t.workspace.id, workspaceId));
    }
  },

  // ── Feature flags ─────────────────────────────────────────
  async setFeatureFlag(workspaceId, key, enabled) {
    // featureFlags live inside the dataset_meta JSONB blob (read-modify-write).
    const db = getDb();
    const rows = await db
      .select()
      .from(t.datasetMeta)
      .where(eq(t.datasetMeta.workspaceId, workspaceId))
      .limit(1);
    const meta = rows[0];
    if (!meta) return;
    const featureFlags = meta.featureFlags.map((f) =>
      f.key === key ? { ...f, enabled } : f,
    );
    await db
      .update(t.datasetMeta)
      .set({ featureFlags })
      .where(eq(t.datasetMeta.workspaceId, workspaceId));
  },

  // ── Billing / subscription ────────────────────────────────
  async setSubscription(workspaceId, patch) {
    const db = getDb();
    const set: Partial<typeof t.subscription.$inferInsert> = {};
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.tier !== undefined) set.tier = patch.tier;
    if (patch.interval !== undefined) set.interval = patch.interval;
    if (patch.stripeCustomerId !== undefined) set.stripeCustomerId = patch.stripeCustomerId;
    if (patch.stripeSubscriptionId !== undefined) set.stripeSubscriptionId = patch.stripeSubscriptionId;
    if (patch.stripePriceId !== undefined) set.stripePriceId = patch.stripePriceId;
    if (patch.currentPeriodEnd !== undefined) set.currentPeriodEnd = patch.currentPeriodEnd;
    if (patch.cancelAtPeriodEnd !== undefined) set.cancelAtPeriodEnd = patch.cancelAtPeriodEnd;
    if (Object.keys(set).length === 0) return;
    await db
      .update(t.subscription)
      .set(set)
      .where(eq(t.subscription.workspaceId, workspaceId));
  },

  async setIntegrationStatus(workspaceId, provider, status, detail) {
    const db = getDb();
    const ctx = await loadContext(db, workspaceId);
    const meta = one(
      await db
        .select()
        .from(t.datasetMeta)
        .where(eq(t.datasetMeta.workspaceId, workspaceId))
        .limit(1),
      `dataset_meta for workspace ${workspaceId}`,
    );
    const now = nowIso();
    const list: Integration[] = [...meta.integrations];
    const idx = list.findIndex((i) => i.provider === provider);
    const existing = idx >= 0 ? list[idx] : undefined;
    if (existing) {
      list[idx] = { ...existing, status, detail, lastSyncAt: now };
    } else {
      list.push({
        id: id("int"),
        locationId: ctx.location.id,
        provider,
        label: provider,
        status,
        detail,
        lastSyncAt: now,
      });
    }
    await db
      .update(t.datasetMeta)
      .set({ integrations: list })
      .where(eq(t.datasetMeta.workspaceId, workspaceId));
  },

  // ── Team ──────────────────────────────────────────────────
  async createStaffInvite(workspaceId, email, role) {
    const db = getDb();
    const key = email.trim().toLowerCase();

    const dupRows = await db
      .select()
      .from(t.staffInvite)
      .where(
        and(
          eq(t.staffInvite.workspaceId, workspaceId),
          eq(t.staffInvite.email, key),
          eq(t.staffInvite.status, "pending"),
        ),
      )
      .limit(1);
    if (dupRows[0]) {
      return { error: "An invite for this email is already pending." };
    }

    const ownerRows = await db
      .select()
      .from(t.appUser)
      .where(and(eq(t.appUser.workspaceId, workspaceId), eq(t.appUser.role, "owner")))
      .limit(1);
    const owner = ownerRows[0];
    if (owner && owner.email.trim().toLowerCase() === key) {
      return { error: "That's the owner's email." };
    }

    const invite: StaffInvite = {
      id: id("inv"),
      workspaceId,
      email: key,
      role,
      token: id("invtok"),
      status: "pending",
      createdAt: nowIso(),
    };
    await db.insert(t.staffInvite).values(buildInviteRow(invite, front()));

    await db.insert(t.auditLog).values({
      id: id("aud"),
      workspaceId,
      actor: "Owner",
      action: "staff.invited",
      targetType: "staff_invite",
      targetId: invite.id,
      at: invite.createdAt,
      seq: front(),
    });

    return invite;
  },

  async addStaffMember(workspaceId, displayName) {
    const db = getDb();
    const ctx = await loadContext(db, workspaceId);

    const member: StaffMember = {
      id: id("stf"),
      locationId: ctx.location.id,
      displayName,
      role: "staff",
      qrToken: id("qrt"),
      active: true,
      streakDays: 0,
      captures: 0,
      detectedReviews: 0,
      avatarInitials: displayName
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    };
    // Staff are appended (memory `push`) — back() sorts after every seed seq.
    await db.insert(t.staffMember).values(buildStaffRow(member, workspaceId, back()));

    // Personal QR for attribution, appended after the workspace's existing QRs.
    const maxRows = await db
      .select({ value: sql<number | null>`max(${t.qrAsset.seq})` })
      .from(t.qrAsset)
      .where(eq(t.qrAsset.workspaceId, workspaceId));
    const nextSeq = (maxRows[0]?.value ?? -1) + 1;
    const first = displayName.split(" ")[0];
    const qr: QrAsset = {
      id: id("qr"),
      locationId: ctx.location.id,
      scope: "staff",
      staffId: member.id,
      label: `${first}'s QR`,
      slug: makeSlug(`${ctx.location.name}-${first ?? "staff"}`, member.id),
      targetUrl: ctx.location.reviewUrl,
      scans: 0,
      pageOpens: 0,
      degraded: false,
    };
    await db.insert(t.qrAsset).values(buildQrRow(qr, workspaceId, nextSeq));

    return member;
  },

  // ── Notifications ─────────────────────────────────────────
  async markNotificationsRead(workspaceId) {
    const db = getDb();
    await db
      .update(t.notification)
      .set({ read: true })
      .where(eq(t.notification.workspaceId, workspaceId));
  },

  // ── Google data sync ──────────────────────────────────────
  async syncGooglePublic(workspaceId): Promise<GoogleSyncResult> {
    const db = getDb();
    const ctx = await loadContext(db, workspaceId);
    const location = mapLocation(ctx.location);
    if (!location.googlePlaceId) {
      return { ok: false, error: "Find your business on Google first (Onboarding → Find your business)." };
    }
    const { getPlaceDetails } = await import("@/lib/google/places");
    const res = await getPlaceDetails(location.googlePlaceId);
    if (!res.ok) return { ok: false, error: friendlyPlacesError(res.reason) };

    const update = buildGooglePublicUpdate(res.details, location, nowIso());

    // 1) Real aggregate onto the location row. The public audit is a fallback,
    // never an overwrite: a Business Profile snapshot sees posts, Q&A, replies
    // and services that Places cannot, so its audit and inbox always win.
    const usePublicAudit = !location.gbpSnapshot;
    await db
      .update(t.location)
      .set({
        rating: update.rating,
        reviewCount: update.reviewCount,
        ...(usePublicAudit
          ? {
              gbpAudit: update.audit,
              suggestionInbox: mergeSuggestionInbox(
                location.suggestionInbox ?? [],
                update.suggestions,
              ),
            }
          : {}),
      })
      .where(and(eq(t.location.id, ctx.location.id), eq(t.location.workspaceId, workspaceId)));

    // 2) Replace the prior public sample (keep GBP/owner reviews).
    await db
      .delete(t.review)
      .where(and(eq(t.review.workspaceId, workspaceId), like(t.review.id, `${PUBLIC_REVIEW_ID_PREFIX}%`)));
    if (update.reviews.length) {
      await db
        .insert(t.review)
        .values(update.reviews.map((r, i) => buildReviewRow(r, workspaceId, front() - i)));
    }

    // 3) dataset_meta: today's score snapshot + integration status.
    const meta = one(
      await db.select().from(t.datasetMeta).where(eq(t.datasetMeta.workspaceId, workspaceId)).limit(1),
      `dataset_meta for workspace ${workspaceId}`,
    );
    const metrics = upsertSnapshot(meta.metrics, update.snapshot);
    const integrations = meta.integrations.map((intg) =>
      intg.provider === "google_places"
        ? {
            ...intg,
            status: "connected" as const,
            detail: `Public Google data synced — ${update.reviewCount} reviews, ${update.rating.toFixed(1)}★`,
            lastSyncAt: update.syncedAt,
          }
        : intg,
    );
    await db
      .update(t.datasetMeta)
      .set({ metrics, integrations })
      .where(eq(t.datasetMeta.workspaceId, workspaceId));

    return {
      ok: true,
      rating: update.rating,
      reviewCount: update.reviewCount,
      reviewsImported: update.reviews.length,
      ...(usePublicAudit
        ? {
            capabilityScore: update.audit.applicableProfileScore,
            auditFindings: update.audit.findings.length,
            suggestionsCreated: update.suggestions.length,
          }
        : {}),
    };
  },

  async syncGoogleProfile(workspaceId): Promise<GoogleSyncResult> {
    const db = getDb();
    const ctx = await loadContext(db, workspaceId);
    const location = mapLocation(ctx.location);
    const credential = await loadGoogleCredential(db, workspaceId);
    const { fetchGoogleProfile, locationFromProfileSnapshot } = await import("@/lib/google/profile-sync");
    const outcome = await fetchGoogleProfile(
      credential,
      location,
      nowIso(),
      await loadInstagramCredential(db, workspaceId),
    );
    if (!outcome.ok) return { ok: false, error: outcome.error };

    if (outcome.pendingApproval) {
      await setGoogleIntegration(
        db,
        workspaceId,
        "needs_attention",
        "Connected — Google Business Profile API approval pending (Google approves per-project; typically 1–2 weeks)",
      );
      return { ok: true, pendingApproval: true };
    }

    const syncedLocation = outcome.profileSnapshot
      ? locationFromProfileSnapshot(location, outcome.profileSnapshot)
      : { ...location, gbpConnected: true };
    if (
      outcome.profileSnapshot ||
      typeof outcome.rating === "number" ||
      typeof outcome.reviewCount === "number"
    ) {
      await db
        .update(t.location)
        .set({
          rating: outcome.rating ?? location.rating,
          reviewCount: outcome.reviewCount ?? location.reviewCount,
          gbpConnected: true,
          name: syncedLocation.name,
          category: syncedLocation.category,
          address: syncedLocation.address,
          city: syncedLocation.city,
          region: syncedLocation.region,
          googlePlaceId: syncedLocation.googlePlaceId,
          reviewUrl: syncedLocation.reviewUrl,
          profileDescription: syncedLocation.profile.description,
          profilePrimaryCategory: syncedLocation.profile.primaryCategory,
          profileSecondaryCategories: syncedLocation.profile.secondaryCategories,
          profilePhotoCount: syncedLocation.profile.photoCount,
          profilePostCount: syncedLocation.profile.postCount,
          profileQnaCount: syncedLocation.profile.qnaCount,
          profileHoursSet: syncedLocation.profile.hoursSet,
          profileHolidayHoursSet: syncedLocation.profile.holidayHoursSet,
          profileServicesWithDescriptions: syncedLocation.profile.servicesWithDescriptions,
          profileServicesTotal: syncedLocation.profile.servicesTotal,
          profileResponseRate: syncedLocation.profile.responseRate,
          profileCompleteness: syncedLocation.profile.completeness,
          gbpSnapshot: syncedLocation.gbpSnapshot,
          gbpAudit: outcome.profileAudit ?? syncedLocation.gbpAudit,
          suggestionInbox: outcome.suggestionInbox
            ? mergeSuggestionInbox(ctx.location.suggestionInbox ?? [], outcome.suggestionInbox)
            : syncedLocation.suggestionInbox,
        })
        .where(and(eq(t.location.id, ctx.location.id), eq(t.location.workspaceId, workspaceId)));
    }

    // Full history supersedes both the public sample and any prior GBP import.
    await db
      .delete(t.review)
      .where(and(eq(t.review.workspaceId, workspaceId), like(t.review.id, `${PUBLIC_REVIEW_ID_PREFIX}%`)));
    await db
      .delete(t.review)
      .where(and(eq(t.review.workspaceId, workspaceId), like(t.review.id, `${GBP_REVIEW_ID_PREFIX}%`)));
    const imported = outcome.reviews ?? [];
    if (imported.length) {
      await db
        .insert(t.review)
        .values(imported.map((r, i) => buildReviewRow(r, workspaceId, front() - i)));
    }

    if (outcome.snapshot || outcome.performanceSnapshots?.length) {
      const meta = one(
        await db.select().from(t.datasetMeta).where(eq(t.datasetMeta.workspaceId, workspaceId)).limit(1),
        `dataset_meta for workspace ${workspaceId}`,
      );
      let metrics = meta.metrics;
      for (const snapshot of outcome.performanceSnapshots ?? []) {
        metrics = upsertSnapshot(metrics, snapshot);
      }
      if (outcome.snapshot) metrics = upsertSnapshot(metrics, outcome.snapshot);
      await db
        .update(t.datasetMeta)
        .set({ metrics })
        .where(eq(t.datasetMeta.workspaceId, workspaceId));
    }
    await setGoogleIntegration(
      db,
      workspaceId,
      outcome.performanceError ? "needs_attention" : "connected",
      `Google Business Profile synced — ${outcome.reviewCount ?? imported.length} reviews`,
    );
    const external = outcome.profileSnapshot?.externalEvidence;
    if (external) {
      await setProviderIntegration(db, workspaceId, "website", external.website.status, external.website.error ?? `${external.website.pages.length} website pages cross-checked`);
      await setProviderIntegration(db, workspaceId, "search_console", external.searchConsole.status, external.searchConsole.error ?? `${external.searchConsole.rows.length} Search Console query rows synced`);
      await setProviderIntegration(db, workspaceId, "instagram", external.instagram.status, external.instagram.error ?? `${external.instagram.media.length} Instagram posts synced`);
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
    const db = getDb();
    const now = nowIso();
    const existing = await loadGoogleCredential(db, workspaceId);
    const row: typeof t.googleCredential.$inferInsert = {
      workspaceId,
      encryptedRefreshToken: input.encryptedRefreshToken,
      googleAccount: input.googleAccount ?? existing?.googleAccount ?? null,
      scopes: input.scopes,
      connectedAt: existing?.connectedAt ?? now,
      updatedAt: now,
    };
    await db
      .insert(t.googleCredential)
      .values(row)
      .onConflictDoUpdate({
        target: t.googleCredential.workspaceId,
        set: {
          encryptedRefreshToken: row.encryptedRefreshToken,
          googleAccount: row.googleAccount,
          scopes: row.scopes,
          updatedAt: row.updatedAt,
        },
      });
  },

  async getGoogleCredential(workspaceId) {
    const db = getDb();
    return loadGoogleCredential(db, workspaceId);
  },

  async saveInstagramCredential(
    workspaceId: string,
    input: SaveInstagramCredentialInput,
  ) {
    const db = getDb();
    const now = nowIso();
    const existing = await loadInstagramCredential(db, workspaceId);
    const row: typeof t.instagramCredential.$inferInsert = {
      workspaceId,
      encryptedAccessToken: input.encryptedAccessToken,
      accountId: input.accountId,
      username: input.username ?? existing?.username ?? null,
      scopes: input.scopes,
      expiresAt: input.expiresAt ?? null,
      connectedAt: existing?.connectedAt ?? now,
      updatedAt: now,
    };
    await db
      .insert(t.instagramCredential)
      .values(row)
      .onConflictDoUpdate({
        target: t.instagramCredential.workspaceId,
        set: {
          encryptedAccessToken: row.encryptedAccessToken,
          accountId: row.accountId,
          username: row.username,
          scopes: row.scopes,
          expiresAt: row.expiresAt,
          updatedAt: row.updatedAt,
        },
      });
  },

  async getInstagramCredential(workspaceId) {
    return loadInstagramCredential(getDb(), workspaceId);
  },

  async updateProfileSuggestion(
    workspaceId: string,
    suggestionId: string,
    patch: ProfileSuggestionPatch,
  ) {
    const db = getDb();
    const rows = await db
      .select({ suggestionInbox: t.location.suggestionInbox })
      .from(t.location)
      .where(eq(t.location.workspaceId, workspaceId))
      .limit(1);
    const inbox = rows[0]?.suggestionInbox ?? [];
    const index = inbox.findIndex((item) => item.id === suggestionId);
    const existing = inbox[index];
    if (index < 0 || !existing) return null;
    const updated: ProfileSuggestion = { ...existing, ...patch };
    const nextInbox = inbox.map((item, itemIndex) => itemIndex === index ? updated : item);
    await db
      .update(t.location)
      .set({ suggestionInbox: nextInbox })
      .where(eq(t.location.workspaceId, workspaceId));
    return updated;
  },

  async updateBusinessDetails(workspaceId: string, patch: BusinessDetailsPatch) {
    const db = getDb();
    const set: Record<string, string | null> = {};
    if (patch.website !== undefined) set.website = patch.website || null;
    if (patch.ownerDescription !== undefined) set.ownerDescription = patch.ownerDescription || null;
    if (!Object.keys(set).length) return;
    await db.update(t.location).set(set).where(eq(t.location.workspaceId, workspaceId));
  },

  async appendProfileSuggestion(workspaceId: string, suggestion: ProfileSuggestion) {
    if (suggestion.workspaceId !== workspaceId) throw new Error("Suggestion workspace mismatch.");
    const db = getDb();
    const rows = await db
      .select({ suggestionInbox: t.location.suggestionInbox })
      .from(t.location)
      .where(eq(t.location.workspaceId, workspaceId))
      .limit(1);
    const inbox = rows[0]?.suggestionInbox ?? [];
    if (inbox.some((item) => item.id === suggestion.id)) return suggestion;
    await db
      .update(t.location)
      .set({ suggestionInbox: [suggestion, ...inbox] })
      .where(eq(t.location.workspaceId, workspaceId));
    return suggestion;
  },

  async createProfileMutationJob(workspaceId, job) {
    if (job.workspaceId !== workspaceId) throw new Error("Mutation job workspace mismatch.");
    const db = getDb();
    const inserted = await db
      .insert(t.profileMutationJob)
      .values(buildMutationJobRow(job))
      .onConflictDoNothing({ target: t.profileMutationJob.idempotencyKey })
      .returning();
    if (inserted[0]) return { job: mapMutationJob(inserted[0]), created: true };
    const existing = await db
      .select()
      .from(t.profileMutationJob)
      .where(and(
        eq(t.profileMutationJob.workspaceId, workspaceId),
        eq(t.profileMutationJob.idempotencyKey, job.idempotencyKey),
      ))
      .limit(1);
    if (!existing[0]) throw new Error("Mutation idempotency key collision.");
    return { job: mapMutationJob(existing[0]), created: false };
  },

  async updateProfileMutationJob(
    workspaceId: string,
    jobId: string,
    patch: ProfileMutationJobPatch,
  ) {
    const db = getDb();
    const rows = await db
      .update(t.profileMutationJob)
      .set(patch)
      .where(and(
        eq(t.profileMutationJob.workspaceId, workspaceId),
        eq(t.profileMutationJob.id, jobId),
      ))
      .returning();
    return rows[0] ? mapMutationJob(rows[0]) : null;
  },

  async getProfileMutationJobByIdempotency(workspaceId, idempotencyKey) {
    const db = getDb();
    const rows = await db
      .select()
      .from(t.profileMutationJob)
      .where(and(
        eq(t.profileMutationJob.workspaceId, workspaceId),
        eq(t.profileMutationJob.idempotencyKey, idempotencyKey),
      ))
      .limit(1);
    return rows[0] ? mapMutationJob(rows[0]) : null;
  },

  async createContentPublishingJob(workspaceId, job) {
    if (job.workspaceId !== workspaceId) throw new Error("Content publishing job workspace mismatch.");
    const inserted = await getDb()
      .insert(t.contentPublishingJob)
      .values(buildContentPublishingJobRow(job))
      .onConflictDoNothing({ target: t.contentPublishingJob.idempotencyKey })
      .returning();
    if (inserted[0]) return { job: mapContentPublishingJob(inserted[0]), created: true };
    const existing = await getDb()
      .select()
      .from(t.contentPublishingJob)
      .where(and(
        eq(t.contentPublishingJob.workspaceId, workspaceId),
        eq(t.contentPublishingJob.idempotencyKey, job.idempotencyKey),
      ))
      .limit(1);
    if (!existing[0]) throw new Error("Content publishing idempotency key collision.");
    return { job: mapContentPublishingJob(existing[0]), created: false };
  },

  async updateContentPublishingJob(
    workspaceId: string,
    jobId: string,
    patch: ContentPublishingJobPatch,
  ) {
    const rows = await getDb()
      .update(t.contentPublishingJob)
      .set(patch)
      .where(and(
        eq(t.contentPublishingJob.workspaceId, workspaceId),
        eq(t.contentPublishingJob.id, jobId),
      ))
      .returning();
    return rows[0] ? mapContentPublishingJob(rows[0]) : null;
  },

  async getContentPublishingJobByIdempotency(workspaceId, idempotencyKey) {
    const rows = await getDb()
      .select()
      .from(t.contentPublishingJob)
      .where(and(
        eq(t.contentPublishingJob.workspaceId, workspaceId),
        eq(t.contentPublishingJob.idempotencyKey, idempotencyKey),
      ))
      .limit(1);
    return rows[0] ? mapContentPublishingJob(rows[0]) : null;
  },

  async listGoogleConnectedWorkspaceIds() {
    const rows = await getDb().select({ workspaceId: t.googleCredential.workspaceId }).from(t.googleCredential);
    return rows.map((row) => row.workspaceId);
  },

  async createMonitoringRun(workspaceId, run) {
    if (run.workspaceId !== workspaceId) throw new Error("Monitoring run workspace mismatch.");
    const inserted = await getDb()
      .insert(t.monitoringRun)
      .values(run)
      .onConflictDoNothing({ target: [t.monitoringRun.workspaceId, t.monitoringRun.windowKey] })
      .returning();
    if (inserted[0]) return { run: mapMonitoringRun(inserted[0]), created: true };
    const existing = await getDb()
      .select()
      .from(t.monitoringRun)
      .where(and(eq(t.monitoringRun.workspaceId, workspaceId), eq(t.monitoringRun.windowKey, run.windowKey)))
      .limit(1);
    if (!existing[0]) throw new Error("Monitoring window collision.");
    return { run: mapMonitoringRun(existing[0]), created: false };
  },

  async updateMonitoringRun(workspaceId: string, runId: string, patch: MonitoringRunPatch) {
    const rows = await getDb()
      .update(t.monitoringRun)
      .set(patch)
      .where(and(eq(t.monitoringRun.workspaceId, workspaceId), eq(t.monitoringRun.id, runId)))
      .returning();
    return rows[0] ? mapMonitoringRun(rows[0]) : null;
  },

  async getMonitoringRunByWindow(workspaceId, windowKey) {
    const rows = await getDb()
      .select()
      .from(t.monitoringRun)
      .where(and(eq(t.monitoringRun.workspaceId, workspaceId), eq(t.monitoringRun.windowKey, windowKey)))
      .limit(1);
    return rows[0] ? mapMonitoringRun(rows[0]) : null;
  },

  async saveAiContentAsset(workspaceId, asset) {
    if (asset.workspaceId !== workspaceId) throw new Error("AI content asset workspace mismatch.");
    const row: typeof t.aiContentAsset.$inferInsert = { ...asset };
    await getDb()
      .insert(t.aiContentAsset)
      .values(row)
      .onConflictDoUpdate({
        target: [t.aiContentAsset.workspaceId, t.aiContentAsset.suggestionId],
        set: {
          id: row.id,
          locationId: row.locationId,
          kind: row.kind,
          mimeType: row.mimeType,
          base64Data: row.base64Data,
          prompt: row.prompt,
          altText: row.altText,
          model: row.model,
          updatedAt: row.updatedAt,
        },
      });
  },

  async getAiContentAssetById(workspaceId, assetId) {
    const rows = await getDb()
      .select()
      .from(t.aiContentAsset)
      .where(and(eq(t.aiContentAsset.workspaceId, workspaceId), eq(t.aiContentAsset.id, assetId)))
      .limit(1);
    return rows[0] ? mapAiContentAsset(rows[0]) : null;
  },

  async getAiContentAssetBySuggestion(workspaceId, suggestionId) {
    const rows = await getDb()
      .select()
      .from(t.aiContentAsset)
      .where(and(
        eq(t.aiContentAsset.workspaceId, workspaceId),
        eq(t.aiContentAsset.suggestionId, suggestionId),
      ))
      .limit(1);
    return rows[0] ? mapAiContentAsset(rows[0]) : null;
  },

  async appendAuditLog(workspaceId, entry) {
    if (entry.workspaceId !== workspaceId) throw new Error("Audit log workspace mismatch.");
    const db = getDb();
    await db
      .insert(t.auditLog)
      .values({
        id: entry.id,
        workspaceId,
        actor: entry.actor,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        at: entry.at,
        meta: entry.meta,
        seq: front(),
      })
      .onConflictDoNothing({ target: t.auditLog.id });
  },

  async appendNotification(workspaceId, notification) {
    const data = await this.getData(workspaceId);
    if (!data || notification.locationId !== data.location.id) throw new Error("Notification location mismatch.");
    await getDb()
      .insert(t.notification)
      .values(buildNotificationRow(notification, workspaceId, front()))
      .onConflictDoNothing({ target: t.notification.id });
  },

  // ── Demo ──────────────────────────────────────────────────
  async resetDemo() {
    // No-op: the demo workspace is served entirely by the memory provider —
    // the database never holds demo data, so there is nothing to reset here.
  },
};

/** Load + map a workspace's stored Google credential (null when absent). */
async function loadGoogleCredential(
  db: FoundlyDb,
  workspaceId: string,
): Promise<GoogleCredential | null> {
  const rows = await db
    .select()
    .from(t.googleCredential)
    .where(eq(t.googleCredential.workspaceId, workspaceId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    workspaceId: row.workspaceId,
    encryptedRefreshToken: row.encryptedRefreshToken,
    googleAccount: row.googleAccount ?? undefined,
    scopes: row.scopes,
    connectedAt: row.connectedAt,
    updatedAt: row.updatedAt,
  };
}

async function loadInstagramCredential(
  db: FoundlyDb,
  workspaceId: string,
): Promise<InstagramCredential | null> {
  const rows = await db
    .select()
    .from(t.instagramCredential)
    .where(eq(t.instagramCredential.workspaceId, workspaceId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    workspaceId: row.workspaceId,
    encryptedAccessToken: row.encryptedAccessToken,
    accountId: row.accountId,
    username: row.username ?? undefined,
    scopes: row.scopes,
    expiresAt: row.expiresAt ?? undefined,
    connectedAt: row.connectedAt,
    updatedAt: row.updatedAt,
  };
}

/** Patch the `google` integration status inside dataset_meta. */
async function setGoogleIntegration(
  db: FoundlyDb,
  workspaceId: string,
  status: Integration["status"],
  detail: string,
): Promise<void> {
  const rows = await db
    .select()
    .from(t.datasetMeta)
    .where(eq(t.datasetMeta.workspaceId, workspaceId))
    .limit(1);
  const meta = rows[0];
  if (!meta) return;
  const integrations = meta.integrations.map((intg) =>
    intg.provider === "google"
      ? { ...intg, status, detail, lastSyncAt: nowIso() }
      : intg,
  );
  await db
    .update(t.datasetMeta)
    .set({ integrations })
    .where(eq(t.datasetMeta.workspaceId, workspaceId));
}

async function setProviderIntegration(
  db: FoundlyDb,
  workspaceId: string,
  provider: Integration["provider"],
  sourceStatus: "synced" | "not_connected" | "not_authorized" | "unavailable" | "error",
  detail: string,
): Promise<void> {
  const rows = await db
    .select()
    .from(t.datasetMeta)
    .where(eq(t.datasetMeta.workspaceId, workspaceId))
    .limit(1);
  const meta = rows[0];
  if (!meta) return;
  const status: Integration["status"] = sourceStatus === "synced"
    ? "connected"
    : sourceStatus === "not_connected"
      ? "disconnected"
      : "needs_attention";
  const now = nowIso();
  let found = false;
  const integrations = meta.integrations.map((entry) => {
    if (entry.provider !== provider) return entry;
    found = true;
    return { ...entry, status, detail, ...(status === "connected" ? { lastSyncAt: now } : {}) };
  });
  if (!found) {
    const locationRows = await db
      .select({ id: t.location.id })
      .from(t.location)
      .where(eq(t.location.workspaceId, workspaceId))
      .limit(1);
    integrations.push({
      id: `int_${provider}_${workspaceId}`,
      locationId: locationRows[0]?.id ?? "",
      provider,
      label: provider === "website" ? "Business website" : provider === "search_console" ? "Google Search Console" : "Instagram professional account",
      status,
      detail,
      ...(status === "connected" ? { lastSyncAt: now } : {}),
    });
  }
  await db
    .update(t.datasetMeta)
    .set({ integrations })
    .where(eq(t.datasetMeta.workspaceId, workspaceId));
}
