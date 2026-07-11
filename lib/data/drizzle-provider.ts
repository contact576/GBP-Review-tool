import { eq } from "drizzle-orm";
import { getDb, type FoundlyDb } from "../db/client";
import * as t from "../db/schema";
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
  Organization,
  Workspace,
  Location,
  User,
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
} from "./types";

/**
 * Postgres/Drizzle DataProvider — the real persistence path (DATABASE_URL set).
 *
 * Every mutation mirrors memory-provider.ts semantics exactly, including its
 * side effects (staff capture++/streak activity, subscription usage counters,
 * audit rows, notifications, consent-filtered campaign audiences, and profile
 * completeness / response-rate bumps). Reads reassemble the identical
 * FoundlyData shape produced by buildSeed().
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
type AuditRow = typeof t.auditLog.$inferSelect;
type OrgRow = typeof t.organization.$inferSelect;
type WorkspaceRow = typeof t.workspace.$inferSelect;
type UserRow = typeof t.appUser.$inferSelect;
type LocationRow = typeof t.location.$inferSelect;

// ── Small helpers ───────────────────────────────────────────
function nowIso(): string {
  return new Date().toISOString();
}
function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
/** Newest-first ordering key for mutation inserts (mirrors `unshift`). */
function front(): number {
  return -Date.now();
}
function one<T>(rows: T[], name: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(
      `Foundly DB not seeded: missing ${name}. Run "npm run db:seed".`,
    );
  }
  return row;
}

interface Ctx {
  workspaceId: string;
  locationId: string;
  region: Location["region"];
}
async function loadContext(db: FoundlyDb): Promise<Ctx> {
  const ws = one(await db.select().from(t.workspace).limit(1), "workspace");
  const loc = one(await db.select().from(t.location).limit(1), "location");
  return {
    workspaceId: ws.id,
    locationId: loc.id,
    region: loc.region as Location["region"],
  };
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
    .where(eq(t.subscription.id, sub.id));
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
    region: row.region as Workspace["region"],
    timezone: row.timezone,
    plan: row.plan as Workspace["plan"],
    createdAt: row.createdAt,
    whiteLabel: row.whiteLabel ?? undefined,
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

// ── Domain → insert-row builders (shared by seed + mutations) ─
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

// ── Clear + seed (shared with the seed-runner) ──────────────
export async function clearAllTables(): Promise<void> {
  const db = getDb();
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

  await db.insert(t.organization).values({
    id: data.organization.id,
    workspaceId: ws,
    name: data.organization.name,
    legalName: data.organization.legalName,
    region: data.organization.region,
    orgType: data.organization.orgType,
    billingEmail: data.organization.billingEmail,
  });

  await db.insert(t.workspace).values({
    id: data.workspace.id,
    organizationId: data.workspace.organizationId,
    name: data.workspace.name,
    vertical: data.workspace.vertical,
    region: data.workspace.region,
    timezone: data.workspace.timezone,
    plan: data.workspace.plan,
    createdAt: data.workspace.createdAt,
    whiteLabel: data.workspace.whiteLabel,
  });

  await db.insert(t.location).values(buildLocationRow(data.location));

  await db.insert(t.appUser).values({
    id: data.owner.id,
    workspaceId: data.owner.workspaceId,
    email: data.owner.email,
    name: data.owner.name,
    role: data.owner.role,
    twoFactorEnabled: data.owner.twoFactorEnabled,
    avatarInitials: data.owner.avatarInitials,
  });

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

  await db.insert(t.subscription).values({
    id: data.subscription.id,
    workspaceId: data.subscription.workspaceId,
    tier: data.subscription.tier,
    interval: data.subscription.interval,
    status: data.subscription.status,
    trialEndsAt: data.subscription.trialEndsAt,
    currency: data.subscription.currency,
    usage: data.subscription.usage,
  });

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

  await db.insert(t.datasetMeta).values({
    workspaceId: ws,
    metrics: data.metrics,
    competitors: data.competitors,
    aeo: data.aeo,
    rankScans: data.rankScans,
    qrAssets: data.qrAssets,
    widgets: data.widgets,
    milestones: data.milestones,
    suppression: data.suppression,
    integrations: data.integrations,
    featureFlags: data.featureFlags,
    invoices: data.invoices,
    reports: data.reports,
    agency: data.agency,
    platform: data.platform,
  });
}

// ── The provider ────────────────────────────────────────────
export const drizzleProvider: DataProvider = {
  backed: "postgres",

  async getData(): Promise<FoundlyData> {
    const db = getDb();
    const [
      orgRows,
      wsRows,
      locRows,
      userRows,
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
      metaRows,
    ] = await Promise.all([
      db.select().from(t.organization).limit(1),
      db.select().from(t.workspace).limit(1),
      db.select().from(t.location).limit(1),
      db.select().from(t.appUser).limit(1),
      db.select().from(t.staffMember).orderBy(t.staffMember.seq),
      db.select().from(t.customer).orderBy(t.customer.seq),
      db.select().from(t.customerConsent),
      db.select().from(t.reviewRequest).orderBy(t.reviewRequest.seq),
      db.select().from(t.review).orderBy(t.review.seq),
      db.select().from(t.reviewReply),
      db.select().from(t.reviewDraft).orderBy(t.reviewDraft.seq),
      db.select().from(t.gbpTask).orderBy(t.gbpTask.seq),
      db.select().from(t.campaign).orderBy(t.campaign.seq),
      db.select().from(t.subscription).limit(1),
      db.select().from(t.privateFeedback).orderBy(t.privateFeedback.seq),
      db.select().from(t.notification).orderBy(t.notification.seq),
      db.select().from(t.auditLog).orderBy(t.auditLog.seq),
      db.select().from(t.datasetMeta).limit(1),
    ]);

    const meta = one(metaRows, "dataset_meta");
    const consentByCustomer = new Map<string, ConsentRow>(
      consentRows.map((c) => [c.customerId, c]),
    );
    const replyByReview = new Map<string, ReplyRow>(
      replyRows.map((r) => [r.reviewId, r]),
    );

    return {
      organization: mapOrg(one(orgRows, "organization")),
      workspace: mapWorkspace(one(wsRows, "workspace")),
      location: mapLocation(one(locRows, "location")),
      owner: mapUser(one(userRows, "owner")),
      staff: staffRows.map(mapStaff),
      customers: customerRows.map((c) =>
        mapCustomer(c, consentByCustomer.get(c.id)),
      ),
      requests: requestRows.map(mapRequest),
      reviews: reviewRows.map((r) => mapReview(r, replyByReview.get(r.id))),
      drafts: draftRows.map(mapDraft),
      tasks: taskRows.map(mapTask),
      campaigns: campaignRows.map(mapCampaign),
      subscription: mapSubscription(one(subRows, "subscription")),
      invoices: meta.invoices,
      competitors: meta.competitors,
      metrics: meta.metrics,
      aeo: meta.aeo,
      rankScans: meta.rankScans,
      qrAssets: meta.qrAssets,
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

  async getCustomer(customerId) {
    const db = getDb();
    const custRows = await db
      .select()
      .from(t.customer)
      .where(eq(t.customer.id, customerId))
      .limit(1);
    const cust = custRows[0];
    if (!cust) return null;
    const consRows = await db
      .select()
      .from(t.customerConsent)
      .where(eq(t.customerConsent.customerId, customerId))
      .limit(1);
    return mapCustomer(cust, consRows[0]);
  },

  async getRequestByToken(token) {
    const db = getDb();
    const reqRows = await db
      .select()
      .from(t.reviewRequest)
      .where(eq(t.reviewRequest.token, token))
      .limit(1);
    const req = reqRows[0];
    if (!req) return null;
    const loc = one(await db.select().from(t.location).limit(1), "location");
    return { request: mapRequest(req), location: mapLocation(loc) };
  },

  async captureCustomer(input: CaptureCustomerInput) {
    const db = getDb();
    const ctx = await loadContext(db);
    const now = nowIso();
    const seq = front();

    const consent: CustomerConsent = {
      serviceConsent: input.serviceConsent,
      serviceConsentAt: input.serviceConsent ? now : undefined,
      marketingConsent: input.marketingConsent,
      marketingConsentAt: input.marketingConsent ? now : undefined,
      consentChannel: "in_person",
      consentSourceText: input.consentSourceText,
      caslCaptured: ctx.region === "CA",
    };
    const customer: Customer = {
      id: id("cus"),
      locationId: input.locationId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      createdAt: now,
      source: "staff",
      staffId: input.staffId,
      visitCount: 1,
      lastVisitAt: now,
      lastRequestAt: now,
      services: input.services,
      sentiment: "neutral",
      lifecycleStage: "requested",
      consent,
      tags: [],
    };
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
      createdAt: now,
      sentAt: input.serviceConsent ? now : undefined,
      attributes: [],
    };

    await db.insert(t.customer).values(buildCustomerRow(customer, ctx.workspaceId, seq));
    await db
      .insert(t.customerConsent)
      .values(buildConsentRow(customer.id, customer.locationId, ctx.workspaceId, consent));
    await db.insert(t.reviewRequest).values(buildRequestRow(request, ctx.workspaceId, seq));

    // Attribution + streak activity bump.
    let actor = "Owner";
    if (input.staffId) {
      const staffRows = await db
        .select()
        .from(t.staffMember)
        .where(eq(t.staffMember.id, input.staffId))
        .limit(1);
      const staff = staffRows[0];
      if (staff) {
        actor = staff.displayName;
        await db
          .update(t.staffMember)
          .set({ captures: staff.captures + 1, lastActiveAt: now })
          .where(eq(t.staffMember.id, staff.id));
      }
    }

    await bumpUsage(db, ctx.workspaceId, (u) => ({
      ...u,
      requestsSent: u.requestsSent + 1,
    }));

    await db.insert(t.auditLog).values({
      id: id("aud"),
      workspaceId: ctx.workspaceId,
      actor,
      action: "customer.captured",
      targetType: "customer",
      targetId: customer.id,
      at: now,
      seq,
    });

    return { customer, request };
  },

  async sendRequest(input: SendRequestInput) {
    const db = getDb();
    const ctx = await loadContext(db);
    const now = nowIso();
    const seq = front();

    const custRows = await db
      .select()
      .from(t.customer)
      .where(eq(t.customer.id, input.customerId))
      .limit(1);
    const customer = custRows[0];

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
      createdAt: now,
      sentAt: now,
      attributes: [],
    };
    await db.insert(t.reviewRequest).values(buildRequestRow(request, ctx.workspaceId, seq));

    if (customer) {
      const nextStage =
        customer.lifecycleStage === "new" ? "requested" : customer.lifecycleStage;
      await db
        .update(t.customer)
        .set({ lastRequestAt: now, lifecycleStage: nextStage })
        .where(eq(t.customer.id, customer.id));
    }

    await bumpUsage(db, ctx.workspaceId, (u) => ({
      ...u,
      requestsSent: u.requestsSent + 1,
    }));

    return request;
  },

  async advanceRequest(token, to, meta) {
    const db = getDb();
    const reqRows = await db
      .select()
      .from(t.reviewRequest)
      .where(eq(t.reviewRequest.token, token))
      .limit(1);
    const req = reqRows[0];
    if (!req) return null;
    const now = nowIso();

    const set: Partial<typeof t.reviewRequest.$inferInsert> = { status: to };
    if (to === "opened") set.openedAt = now;
    if (to === "clicked" || to === "posted_google" || to === "private_feedback") {
      set.clickedAt = req.clickedAt ?? now;
    }
    if (meta?.rating) set.rating = meta.rating;
    if (meta?.attributes) set.attributes = meta.attributes;
    await db.update(t.reviewRequest).set(set).where(eq(t.reviewRequest.id, req.id));

    const custRows = await db
      .select()
      .from(t.customer)
      .where(eq(t.customer.id, req.customerId))
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
        await db.update(t.customer).set(custSet).where(eq(t.customer.id, customer.id));
      }
    }

    const updatedRows = await db
      .select()
      .from(t.reviewRequest)
      .where(eq(t.reviewRequest.id, req.id))
      .limit(1);
    const updated = updatedRows[0];
    return updated ? mapRequest(updated) : null;
  },

  async submitPrivateFeedback(input: SubmitPrivateFeedbackInput) {
    const db = getDb();
    const ctx = await loadContext(db);
    const now = nowIso();
    const seq = front();

    const reqRows = await db
      .select()
      .from(t.reviewRequest)
      .where(eq(t.reviewRequest.token, input.token))
      .limit(1);
    const req = reqRows[0];

    const fb: PrivateFeedback = {
      id: id("pf"),
      locationId: ctx.locationId,
      customerName: req?.customerName ?? "Customer",
      rating: input.rating,
      text: input.text,
      createdAt: now,
      resolved: false,
    };
    await db.insert(t.privateFeedback).values(buildPrivateFeedbackRow(fb, ctx.workspaceId, seq));

    if (req) {
      await db
        .update(t.reviewRequest)
        .set({
          status: "private_feedback",
          rating: input.rating,
          privateFeedback: input.text,
        })
        .where(eq(t.reviewRequest.id, req.id));
    }

    await db.insert(t.notification).values({
      id: id("ntf"),
      workspaceId: ctx.workspaceId,
      locationId: ctx.locationId,
      kind: "feedback",
      title: "Private feedback needs attention",
      body: `A ${input.rating}★ private note came in.`,
      createdAt: now,
      read: false,
      seq,
    });

    return fb;
  },

  async recordDraft(input: RecordDraftInput) {
    const db = getDb();
    const ctx = await loadContext(db);
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
      .values(buildDraftRow(draft, ctx.workspaceId, ctx.locationId, seq));

    await bumpUsage(db, ctx.workspaceId, (u) => ({
      ...u,
      aiDraftsUsed: u.aiDraftsUsed + 1,
    }));

    return draft;
  },

  async approveTask(taskId) {
    const db = getDb();
    const ctx = await loadContext(db);
    const now = nowIso();

    const taskRows = await db
      .select()
      .from(t.gbpTask)
      .where(eq(t.gbpTask.id, taskId))
      .limit(1);
    const task = taskRows[0];
    if (!task) return null;

    await db.update(t.gbpTask).set({ status: "done" }).where(eq(t.gbpTask.id, task.id));

    const locRows = await db.select().from(t.location).limit(1);
    const loc = locRows[0];
    if (loc) {
      const locSet: Partial<typeof t.location.$inferInsert> = {
        profileCompleteness: Math.min(100, loc.profileCompleteness + 3),
      };
      if (task.kind === "post") locSet.profilePostCount = loc.profilePostCount + 1;
      if (task.kind === "qna") locSet.profileQnaCount = loc.profileQnaCount + 1;
      await db.update(t.location).set(locSet).where(eq(t.location.id, loc.id));
    }

    await db.insert(t.auditLog).values({
      id: id("aud"),
      workspaceId: ctx.workspaceId,
      actor: "Owner",
      action: "task.approved",
      targetType: "gbp_task",
      targetId: task.id,
      at: now,
      seq: front(),
    });

    return mapTask({ ...task, status: "done" });
  },

  async snoozeTask(taskId) {
    const db = getDb();
    const taskRows = await db
      .select()
      .from(t.gbpTask)
      .where(eq(t.gbpTask.id, taskId))
      .limit(1);
    const task = taskRows[0];
    if (!task) return null;
    await db.update(t.gbpTask).set({ status: "snoozed" }).where(eq(t.gbpTask.id, task.id));
    return mapTask({ ...task, status: "snoozed" });
  },

  async postReply(input: PostReplyInput) {
    const db = getDb();
    const ctx = await loadContext(db);
    const now = nowIso();

    const revRows = await db
      .select()
      .from(t.review)
      .where(eq(t.review.id, input.reviewId))
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
    const replyRow = buildReplyRow(rev.id, reply, ctx.workspaceId, rev.locationId);
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

    await db.update(t.review).set({ needsReply: false }).where(eq(t.review.id, rev.id));

    const locRows = await db.select().from(t.location).limit(1);
    const loc = locRows[0];
    if (loc) {
      await db
        .update(t.location)
        .set({ profileResponseRate: Math.min(1, loc.profileResponseRate + 0.02) })
        .where(eq(t.location.id, loc.id));
    }

    await db.insert(t.auditLog).values({
      id: id("aud"),
      workspaceId: ctx.workspaceId,
      actor: "Owner",
      action: "review.replied",
      targetType: "review",
      targetId: rev.id,
      at: now,
      seq: front(),
    });

    return mapReview({ ...rev, needsReply: false }, replyRow);
  },

  async createCampaign(input: CreateCampaignInput) {
    const db = getDb();
    const ctx = await loadContext(db);
    const now = nowIso();

    const customerRows = await db.select().from(t.customer);
    const consentRows = await db.select().from(t.customerConsent);
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
          reason:
            input.consentBasis === "marketing"
              ? "Not opted in to marketing"
              : "No service consent",
          count: total - consented,
        },
      ],
      stats: { sent: input.scheduledAt ? 0 : consented, opened: 0, clicked: 0 },
      createdAt: now,
    };
    await db.insert(t.campaign).values(buildCampaignRow(campaign, ctx.workspaceId, front()));

    return campaign;
  },

  async updateConsent(customerId, consent) {
    const db = getDb();
    const custRows = await db
      .select()
      .from(t.customer)
      .where(eq(t.customer.id, customerId))
      .limit(1);
    const cust = custRows[0];
    if (!cust) return null;

    const consRows = await db
      .select()
      .from(t.customerConsent)
      .where(eq(t.customerConsent.customerId, customerId))
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
      .where(eq(t.customerConsent.customerId, customerId));

    return mapCustomer(cust, mergedRow);
  },

  async resetDemo() {
    await clearAllTables();
    await seedDatabase(buildSeed());
  },
};
