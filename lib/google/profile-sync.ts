import "server-only";
import type { GoogleCredential, InstagramCredential } from "@/lib/data/provider";
import type {
  GbpAttributeValue,
  GbpLocalPost,
  GbpLocationRecord,
  GbpMediaItem,
  GbpProfileSnapshot,
  GbpQuestion,
  LocalGrowthAudit,
  ProfileSuggestion,
  Location,
  MetricSnapshot,
  Review,
} from "@/lib/data/types";
import { buildLocalGrowthAudit } from "@/lib/audit/engine";
import { buildSuggestionInbox } from "@/lib/suggestions/inbox";
import { collectWebsiteEvidence } from "@/lib/evidence/website";
import { collectInstagramEvidence } from "@/lib/evidence/instagram";
import { collectSearchConsoleEvidence } from "./search-console";
import { scoreApplicableCapabilities } from "@/lib/compliance/product-policy";
import { computePublicScore } from "@/lib/data/selectors";
import { decryptSecret } from "./crypto";
import {
  getGoogleUpdatedLocation,
  getDailyMetricTimeSeries,
  getLocation,
  getLocationAttributes,
  listAccounts,
  listAvailableAttributes,
  listLocations,
  listLocalPosts,
  listMedia,
  listQuestions,
  listReviews,
  listSearchKeywordImpressions,
  PERFORMANCE_DAILY_METRICS,
  refreshAccessToken,
  type GbpDailyMetricValue,
  type GbpReview,
  type PerformanceDailyMetric,
} from "./gbp";
import { daysSince, GBP_REVIEW_ID_PREFIX } from "./public-sync";

/**
 * Google Business Profile (owned-profile) sync — the deeper integration that
 * imports your FULL review history and drives real dashboard numbers.
 *
 * GATED BY GOOGLE APPROVAL: GBP API access is granted per Cloud project and
 * typically takes 1–2 weeks. Until then every call 403s and this returns
 * `{ ok: true, pendingApproval: true }` so the app waits honestly instead of
 * pretending. This path is built and unit-tested for parsing/gating, but it
 * has NOT been exercised against live GBP data (approval pending).
 */

export { GBP_REVIEW_ID_PREFIX };

export interface ProfileSyncOutcome {
  ok: boolean;
  pendingApproval?: boolean;
  error?: string;
  rating?: number;
  reviewCount?: number;
  reviews?: Review[];
  snapshot?: MetricSnapshot;
  performanceSnapshots?: MetricSnapshot[];
  performanceError?: string;
  profileSnapshot?: GbpProfileSnapshot;
  profileAudit?: LocalGrowthAudit;
  suggestionInbox?: ProfileSuggestion[];
}

export async function fetchGoogleProfile(
  credential: GoogleCredential | null,
  location: Location,
  nowIso: string,
  instagramCredential: InstagramCredential | null = null,
): Promise<ProfileSyncOutcome> {
  if (!credential) {
    return {
      ok: false,
      error:
        "Google Business Profile isn't connected yet — connect it in Settings → Integrations.",
    };
  }
  const refreshToken = decryptSecret(credential.encryptedRefreshToken);
  if (!refreshToken) {
    return { ok: false, error: "Stored Google credential couldn't be read — reconnect Google." };
  }

  const token = await refreshAccessToken(refreshToken);
  if (!token.ok) {
    return {
      ok: false,
      error:
        token.reason === "unauthorized"
          ? "Google connection expired — reconnect Google in Settings → Integrations."
          : token.detail,
    };
  }
  const accessToken = token.data.accessToken;

  const located = await resolveLocationResource(accessToken, credential, location);
  if (!located.ok) {
    if (located.pendingApproval) return { ok: true, pendingApproval: true };
    return { ok: false, error: located.error };
  }

  const locationRes = await getLocation(accessToken, located.locationResource);
  if (!locationRes.ok) {
    if (locationRes.reason === "not_approved") return { ok: true, pendingApproval: true };
    return { ok: false, error: locationRes.detail };
  }

  const googleLocationId = located.locationResource.split("/").pop() ?? "";
  const keywordRange = searchKeywordMonthRange(nowIso);
  const externalRange = externalEvidenceDateRange(nowIso);
  const instagramToken = instagramCredential
    ? decryptSecret(instagramCredential.encryptedAccessToken)
    : null;
  const [
    reviewsRes,
    attributesRes,
    availableAttributesRes,
    mediaRes,
    postsRes,
    questionsRes,
    googleUpdatedRes,
    performance,
    searchKeywordsRes,
    websiteEvidence,
    searchConsoleEvidence,
    instagramEvidence,
  ] = await Promise.all([
    listReviews(accessToken, located.accountLocationResource),
    getLocationAttributes(accessToken, located.locationResource),
    listAvailableAttributes(accessToken, located.locationResource),
    listMedia(accessToken, located.accountLocationResource),
    listLocalPosts(accessToken, located.accountLocationResource),
    listQuestions(accessToken, located.locationResource),
    getGoogleUpdatedLocation(accessToken, located.locationResource),
    fetchPerformanceSnapshots(accessToken, googleLocationId, location.id, nowIso),
    listSearchKeywordImpressions(
      accessToken,
      googleLocationId,
      keywordRange.startMonth,
      keywordRange.endMonth,
    ),
    collectWebsiteEvidence(locationRes.data.websiteUri, nowIso),
    collectSearchConsoleEvidence({
      accessToken,
      websiteUrl: locationRes.data.websiteUri,
      observedAt: nowIso,
      startDate: externalRange.startDate,
      endDate: externalRange.endDate,
      scopeGranted: credential.scopes.includes("webmasters.readonly") || credential.scopes.includes("/auth/webmasters"),
    }),
    collectInstagramEvidence(instagramToken, nowIso),
  ]);
  if (!reviewsRes.ok) {
    if (reviewsRes.reason === "not_approved") return { ok: true, pendingApproval: true };
    return { ok: false, error: reviewsRes.detail };
  }

  const page = reviewsRes.data;
  const reviews = mapReviews(page.reviews, location.id, nowIso);
  const reviewCount = page.totalReviewCount || reviews.length;
  const rating = page.averageRating || aggregateRating(reviews);
  const responseRate = reviews.length
    ? reviews.filter((review) => !review.needsReply).length / reviews.length
    : 0;
  const sourceStatus: GbpProfileSnapshot["sourceStatus"] = {
    location: "synced",
    attributes: sourceStatusFor(attributesRes),
    attributeMetadata: sourceStatusFor(availableAttributesRes),
    media: sourceStatusFor(mediaRes),
    posts: sourceStatusFor(postsRes),
    questions: sourceStatusFor(questionsRes),
    reviews: "synced",
    performance: performance.error ? "error" : "synced",
    searchKeywords: sourceStatusFor(searchKeywordsRes),
    googleUpdates: sourceStatusFor(googleUpdatedRes),
  };
  const warnings = [
    warningFor("Configured attributes", attributesRes),
    warningFor("Available attributes", availableAttributesRes),
    warningFor("Original Google media", mediaRes),
    warningFor("Local posts", postsRes),
    warningFor("Questions and answers", questionsRes),
    warningFor("Google-updated fields", googleUpdatedRes),
    warningFor("Search keywords", searchKeywordsRes),
    performance.error ? `Performance: ${performance.error}` : undefined,
    websiteEvidence.error ? `Website: ${websiteEvidence.error}` : undefined,
    searchConsoleEvidence.error ? `Search Console: ${searchConsoleEvidence.error}` : undefined,
    instagramEvidence.error ? `Instagram: ${instagramEvidence.error}` : undefined,
  ].filter((warning): warning is string => Boolean(warning));
  const capabilities = deriveGbpCapabilities({
    location: locationRes.data,
    attributes: attributesRes.ok ? attributesRes.data : [],
    availableAttributes: availableAttributesRes.ok ? availableAttributesRes.data : [],
    media: mediaRes.ok ? mediaRes.data : [],
    posts: postsRes.ok ? postsRes.data : [],
    questions: questionsRes.ok ? questionsRes.data : [],
    reviews,
    sourceStatus,
    nowIso,
  });
  const capabilityScore = scoreApplicableCapabilities(capabilities);
  const profileSnapshot: GbpProfileSnapshot = {
    schemaVersion: 1,
    source: "google_business_profile",
    accountResource: located.accountResource,
    locationResource: located.locationResource,
    syncedAt: nowIso,
    location: locationRes.data,
    attributes: attributesRes.ok ? attributesRes.data : [],
    availableAttributes: availableAttributesRes.ok ? availableAttributesRes.data : [],
    media: mediaRes.ok ? mediaRes.data : [],
    localPosts: postsRes.ok ? postsRes.data : [],
    questions: questionsRes.ok ? questionsRes.data : [],
    searchKeywords: searchKeywordsRes.ok ? searchKeywordsRes.data : [],
    externalEvidence: {
      website: websiteEvidence,
      searchConsole: searchConsoleEvidence,
      instagram: instagramEvidence,
    },
    googleUpdated: googleUpdatedRes.ok ? googleUpdatedRes.data : undefined,
    capabilities,
    capabilityScore,
    reviewResponseRate: responseRate,
    sourceStatus,
    warnings,
  };
  const syncedLocation = locationFromProfileSnapshot(location, profileSnapshot);
  const profileAudit = buildLocalGrowthAudit({
    location: syncedLocation,
    snapshot: profileSnapshot,
    reviews,
    nowIso,
  });
  const suggestionInbox = buildSuggestionInbox(profileAudit);
  const metricSnapshot = buildSnapshot(
    syncedLocation,
    rating,
    reviewCount,
    reviews,
    nowIso,
  );

  return {
    ok: true,
    rating,
    reviewCount,
    reviews,
    snapshot: metricSnapshot,
    performanceSnapshots: performance.snapshots,
    performanceError: performance.error,
    profileSnapshot,
    profileAudit,
    suggestionInbox,
  };
}

type ResolveResult =
  | {
      ok: true;
      accountResource: string;
      locationResource: string;
      accountLocationResource: string;
    }
  | { ok: false; pendingApproval?: boolean; error?: string };

/** Find "accounts/{a}/locations/{l}" for this workspace's Place ID. */
async function resolveLocationResource(
  accessToken: string,
  credential: GoogleCredential,
  location: Location,
): Promise<ResolveResult> {
  const accounts = await listAccounts(accessToken);
  if (!accounts.ok) {
    if (accounts.reason === "not_approved") return { ok: false, pendingApproval: true };
    return { ok: false, error: accounts.detail };
  }
  // Prefer the stored account when present, else scan all manageable accounts.
  const names = credential.googleAccount
    ? [credential.googleAccount, ...accounts.data.map((a) => a.name)]
    : accounts.data.map((a) => a.name);
  const seen = new Set<string>();

  for (const account of names) {
    if (seen.has(account)) continue;
    seen.add(account);
    const locs = await listLocations(accessToken, account);
    if (!locs.ok) {
      if (locs.reason === "not_approved") return { ok: false, pendingApproval: true };
      continue;
    }
    const match = location.googlePlaceId
      ? locs.data.find((l) => l.metadata?.placeId === location.googlePlaceId)
      : locs.data[0];
    if (match) {
      return {
        ok: true,
        accountResource: account,
        locationResource: match.name,
        accountLocationResource: `${account}/${match.name}`,
      };
    }
  }
  return {
    ok: false,
    error:
      "Couldn't find your business under the connected Google account. Make sure you connect the account that owns this profile.",
  };
}

function mapReviews(gbp: GbpReview[], locationId: string, nowIso: string): Review[] {
  return gbp.map((r, i) => ({
    id: `${GBP_REVIEW_ID_PREFIX}${r.reviewId || i}`,
    locationId,
    author: r.author,
    rating: r.rating,
    text: r.text,
    publishedAt: r.createTime ?? nowIso,
    source: "google" as const,
    durability: "stable" as const,
    needsReply: !r.reply,
  }));
}

function aggregateRating(reviews: Review[]): number {
  if (!reviews.length) return 0;
  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}

function sourceStatusFor<T>(
  result: { ok: true; data: T } | { ok: false; reason: string; detail: string },
): GbpProfileSnapshot["sourceStatus"][keyof GbpProfileSnapshot["sourceStatus"]] {
  if (result.ok) return "synced";
  if (result.reason === "unauthorized" || result.reason === "not_approved") return "not_authorized";
  if (/\b(404|unsupported|not available)\b/i.test(result.detail)) return "unavailable";
  return "error";
}

function warningFor<T>(
  label: string,
  result: { ok: true; data: T } | { ok: false; reason: string; detail: string },
): string | undefined {
  return result.ok ? undefined : `${label}: ${result.detail}`;
}

function searchKeywordMonthRange(nowIso: string): { startMonth: string; endMonth: string } {
  const now = new Date(nowIso);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 5, 1));
  return {
    startMonth: endMonth(start),
    endMonth: endMonth(end),
  };
}

function endMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function externalEvidenceDateRange(nowIso: string): { startDate: string; endDate: string } {
  const now = new Date(nowIso);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2));
  const start = new Date(end.getTime() - 89 * 86_400_000);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

type SnapshotCapability = GbpProfileSnapshot["capabilities"][number];

/**
 * Derive completion from fields and endpoint eligibility, never from a static
 * checklist. This is exported so the audit contract can be regression-tested.
 */
export function deriveGbpCapabilities(input: {
  location: GbpLocationRecord;
  attributes: GbpAttributeValue[];
  availableAttributes: GbpAttributeValue[];
  media: GbpMediaItem[];
  posts: GbpLocalPost[];
  questions: GbpQuestion[];
  reviews: Review[];
  sourceStatus: GbpProfileSnapshot["sourceStatus"];
  nowIso: string;
}): SnapshotCapability[] {
  const { location, sourceStatus } = input;
  const categoryCount = location.categories?.additionalCategories?.length ?? 0;
  const services = location.serviceItems ?? [];
  const describedServices = services.filter((service) => Boolean(service.description?.trim())).length;
  const addressOrArea = hasContent(location.storefrontAddress) || hasContent(location.serviceArea);
  const currentAttributes = input.attributes.filter((attribute) => attribute.name);
  const availableAttributes = input.availableAttributes.filter((attribute) => attribute.name);
  const recentPostCount = input.posts.filter((post) => daysOld(post.createTime, input.nowIso) <= 30).length;
  const unansweredQuestions = input.questions.filter((question) => (question.totalAnswerCount ?? 0) === 0).length;
  const reviewReplyCount = input.reviews.filter((review) => !review.needsReply).length;
  const urlAttributeNames = availableAttributes
    .filter((attribute) => attribute.valueType === "URL" || /url|link/i.test(attribute.name))
    .map((attribute) => attribute.name);
  const configuredUrlAttributes = currentAttributes.filter((attribute) =>
    urlAttributeNames.includes(attribute.name) && (attribute.uriValues?.length ?? 0) > 0,
  ).length;

  return [
    capability("business_title", "Business name", textStatus(location.title), 3, location.title ? "Google business name is set." : "No business name was returned."),
    capability(
      "primary_category",
      "Primary category",
      location.categories?.primaryCategory?.name ? "complete" : "missing",
      4,
      categoryEvidence(location.categories?.primaryCategory),
    ),
    capability(
      "additional_categories",
      "Additional categories",
      categoryCount >= 2 ? "complete" : categoryCount === 1 ? "partial" : "missing",
      2,
      `${categoryCount} additional ${categoryCount === 1 ? "category" : "categories"} configured.`,
    ),
    capability("address_or_service_area", "Address or service area", addressOrArea ? "complete" : "missing", 4, addressOrArea ? "A customer-facing location or service area is configured." : "Neither an address nor a service area was returned."),
    capability("phone", "Phone number", textStatus(location.phoneNumbers?.primaryPhone), 3, location.phoneNumbers?.primaryPhone ? "Primary phone is set." : "Primary phone is missing."),
    capability("website", "Website", textStatus(location.websiteUri), 3, location.websiteUri ? "Website URL is set." : "Website URL is missing."),
    capability(
      "description",
      "Business description",
      descriptionStatus(location.profile?.description),
      3,
      `${location.profile?.description?.trim().length ?? 0} characters in the current description.`,
    ),
    capability("regular_hours", "Regular hours", hasContent(location.regularHours) ? "complete" : "missing", 3, hasContent(location.regularHours) ? "Regular hours were returned by Google." : "Regular hours are missing."),
    capability("special_hours", "Special and holiday hours", hasContent(location.specialHours) ? "complete" : "missing", 2, hasContent(location.specialHours) ? "Special hours are configured." : "No special-hour periods are configured."),
    capability(
      "services",
      "Services",
      serviceStatus(location.metadata?.canModifyServiceList, services.length, describedServices),
      4,
      location.metadata?.canModifyServiceList === false
        ? "Google marks service-list editing as unavailable for this location."
        : `${services.length} services; ${describedServices} include descriptions.`,
    ),
    capability(
      "attributes",
      "Business attributes",
      endpointRatioStatus(sourceStatus.attributeMetadata, currentAttributes.length, availableAttributes.length),
      2,
      sourceStatus.attributeMetadata === "synced"
        ? `${currentAttributes.length} configured across ${availableAttributes.length} currently available attributes.`
        : "Attribute eligibility could not be confirmed in this sync.",
    ),
    capability(
      "action_links",
      "Action links",
      sourceStatus.attributeMetadata !== "synced"
        ? "unknown"
        : urlAttributeNames.length === 0
          ? "not_applicable"
          : configuredUrlAttributes === urlAttributeNames.length
            ? "complete"
            : configuredUrlAttributes > 0
              ? "partial"
              : "missing",
      2,
      sourceStatus.attributeMetadata === "synced"
        ? `${configuredUrlAttributes} of ${urlAttributeNames.length} eligible link attributes are configured.`
        : "Link eligibility could not be confirmed in this sync.",
    ),
    capability(
      "cover_media",
      "Cover photo",
      mediaStatus(sourceStatus.media, input.media.some((media) => media.category === "COVER")),
      3,
      input.media.some((media) => media.category === "COVER") ? "Google cover photo found." : "No Google cover photo was returned.",
    ),
    capability(
      "profile_media",
      "Profile photo or logo",
      mediaStatus(sourceStatus.media, input.media.some((media) => media.category === "PROFILE" || media.category === "LOGO")),
      2,
      input.media.some((media) => media.category === "PROFILE" || media.category === "LOGO") ? "Profile or logo media found." : "No profile or logo media was returned.",
    ),
    capability(
      "media_library",
      "Photo library",
      sourceStatus.media !== "synced" ? "unknown" : input.media.length >= 10 ? "complete" : input.media.length > 0 ? "partial" : "missing",
      3,
      `${input.media.length} original Google media items synced.`,
    ),
    capability(
      "local_posts",
      "Local posts",
      sourceStatus.posts === "unavailable" ? "not_applicable" : sourceStatus.posts !== "synced" ? "unknown" : recentPostCount > 0 ? "complete" : input.posts.length > 0 ? "partial" : "missing",
      2,
      `${input.posts.length} posts synced; ${recentPostCount} published in the last 30 days.`,
    ),
    capability(
      "questions",
      "Questions and answers",
      sourceStatus.questions === "unavailable" ? "not_applicable" : sourceStatus.questions !== "synced" ? "unknown" : input.questions.length === 0 ? "not_applicable" : unansweredQuestions === 0 ? "complete" : unansweredQuestions < input.questions.length ? "partial" : "missing",
      1,
      input.questions.length === 0 ? "No customer questions currently require an answer." : `${unansweredQuestions} of ${input.questions.length} questions have no answer.`,
    ),
    capability(
      "review_replies",
      "Review replies",
      input.reviews.length === 0 ? "not_applicable" : reviewReplyCount / input.reviews.length >= 0.9 ? "complete" : reviewReplyCount > 0 ? "partial" : "missing",
      3,
      input.reviews.length === 0 ? "No reviews are available yet." : `${reviewReplyCount} of ${input.reviews.length} imported reviews have a reply.`,
    ),
  ];
}

function capability(
  key: string,
  label: string,
  status: SnapshotCapability["status"],
  weight: number,
  evidence: string,
): SnapshotCapability {
  return { key, label, status, weight, evidence };
}

function textStatus(value: string | undefined): SnapshotCapability["status"] {
  return value?.trim() ? "complete" : "missing";
}

function descriptionStatus(value: string | undefined): SnapshotCapability["status"] {
  const length = value?.trim().length ?? 0;
  return length >= 100 ? "complete" : length > 0 ? "partial" : "missing";
}

function categoryEvidence(category: { name: string; displayName?: string } | undefined): string {
  if (!category) return "No primary category was returned.";
  return `Primary category: ${category.displayName ?? category.name}.`;
}

function hasContent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function serviceStatus(
  canModify: boolean | undefined,
  total: number,
  described: number,
): SnapshotCapability["status"] {
  if (canModify === false) return "not_applicable";
  if (canModify === undefined) return "unknown";
  if (total === 0) return "missing";
  return described === total ? "complete" : "partial";
}

function endpointRatioStatus(
  sourceStatus: GbpProfileSnapshot["sourceStatus"][keyof GbpProfileSnapshot["sourceStatus"]],
  configured: number,
  available: number,
): SnapshotCapability["status"] {
  if (sourceStatus !== "synced") return "unknown";
  if (available === 0) return "not_applicable";
  if (configured === 0) return "missing";
  return configured / available >= 0.6 ? "complete" : "partial";
}

function mediaStatus(
  sourceStatus: GbpProfileSnapshot["sourceStatus"][keyof GbpProfileSnapshot["sourceStatus"]],
  present: boolean,
): SnapshotCapability["status"] {
  if (sourceStatus !== "synced") return "unknown";
  return present ? "complete" : "missing";
}

function daysOld(value: string | undefined, nowIso: string): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const then = new Date(value).getTime();
  const now = new Date(nowIso).getTime();
  return Number.isFinite(then) && Number.isFinite(now)
    ? Math.max(0, (now - then) / 86_400_000)
    : Number.POSITIVE_INFINITY;
}

export function profileStateFromSnapshot(
  current: Location,
  snapshot: GbpProfileSnapshot,
): Location["profile"] {
  const services = snapshot.location.serviceItems ?? [];
  const categories = snapshot.location.categories;
  return {
    description: snapshot.location.profile?.description ?? "",
    primaryCategory:
      categories?.primaryCategory?.displayName ?? categories?.primaryCategory?.name ?? current.category,
    secondaryCategories: (categories?.additionalCategories ?? []).map(
      (category) => category.displayName ?? category.name,
    ),
    photoCount: snapshot.sourceStatus.media === "synced" ? snapshot.media.length : current.profile.photoCount,
    postCount: snapshot.sourceStatus.posts === "synced" ? snapshot.localPosts.length : current.profile.postCount,
    qnaCount: snapshot.sourceStatus.questions === "synced" ? snapshot.questions.length : current.profile.qnaCount,
    hoursSet: hasContent(snapshot.location.regularHours),
    holidayHoursSet: hasContent(snapshot.location.specialHours),
    servicesWithDescriptions: services.filter((service) => Boolean(service.description?.trim())).length,
    servicesTotal: services.length,
    responseRate: snapshot.reviewResponseRate,
    completeness: snapshot.capabilityScore.score,
  };
}

/** Project the latest Google-owned record onto the app's location summary. */
export function locationFromProfileSnapshot(
  current: Location,
  snapshot: GbpProfileSnapshot,
): Location {
  const google = snapshot.location;
  const primaryCategory = google.categories?.primaryCategory;
  const addressLines = google.storefrontAddress?.addressLines ?? [];
  const address = [
    ...addressLines,
    google.storefrontAddress?.locality,
    google.storefrontAddress?.administrativeArea,
    google.storefrontAddress?.postalCode,
  ].filter((value): value is string => Boolean(value?.trim())).join(", ");
  const regionCode = google.storefrontAddress?.regionCode;
  return {
    ...current,
    name: google.title?.trim() || current.name,
    category: primaryCategory?.displayName ?? primaryCategory?.name ?? current.category,
    address: address || current.address,
    city: google.storefrontAddress?.locality?.trim() || current.city,
    region: regionCode === "US" || regionCode === "CA" ? regionCode : current.region,
    googlePlaceId: google.metadata?.placeId ?? current.googlePlaceId,
    reviewUrl: google.metadata?.newReviewUri ?? current.reviewUrl,
    profile: profileStateFromSnapshot(current, snapshot),
    gbpConnected: true,
    gbpSnapshot: snapshot,
  };
}

const FOUND_METRICS = new Set<PerformanceDailyMetric>([
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
]);

async function fetchPerformanceSnapshots(
  accessToken: string,
  googleLocationId: string,
  locationId: string,
  nowIso: string,
): Promise<{ snapshots?: MetricSnapshot[]; error?: string }> {
  if (!googleLocationId) return { error: "Google returned no performance location id." };
  const now = new Date(nowIso);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(end.getTime() - 118 * 86_400_000);
  const startDate = isoDate(start);
  const endDate = isoDate(end);
  const results = await Promise.all(
    PERFORMANCE_DAILY_METRICS.map(async (metric) => ({
      metric,
      result: await getDailyMetricTimeSeries(
        accessToken,
        googleLocationId,
        metric,
        startDate,
        endDate,
      ),
    })),
  );
  const failed = results.find((entry) => !entry.result.ok);
  if (failed && !failed.result.ok) {
    return { error: failed.result.detail };
  }
  const series: Partial<Record<PerformanceDailyMetric, GbpDailyMetricValue[]>> = {};
  for (const entry of results) {
    if (entry.result.ok) series[entry.metric] = entry.result.data;
  }
  return { snapshots: buildPerformanceSnapshots(locationId, series, startDate, endDate) };
}

/** Turn daily GBP counts into complete rolling-30-day dashboard observations. */
export function buildPerformanceSnapshots(
  locationId: string,
  series: Partial<Record<PerformanceDailyMetric, GbpDailyMetricValue[]>>,
  startDate: string,
  endDate: string,
): MetricSnapshot[] {
  const dates = utcDateRange(startDate, endDate);
  const values = new Map<PerformanceDailyMetric, Map<string, number>>();
  for (const metric of PERFORMANCE_DAILY_METRICS) {
    values.set(
      metric,
      new Map((series[metric] ?? []).map((point) => [point.date, Math.max(0, point.value)])),
    );
  }
  return dates.slice(29).map((date, outputIndex) => {
    const index = outputIndex + 29;
    const windowDates = dates.slice(index - 29, index + 1);
    let foundYou = 0;
    let contactedYou = 0;
    for (const metric of PERFORMANCE_DAILY_METRICS) {
      const total = windowDates.reduce(
        (sum, day) => sum + (values.get(metric)?.get(day) ?? 0),
        0,
      );
      if (FOUND_METRICS.has(metric)) foundYou += total;
      else contactedYou += total;
    }
    return {
      locationId,
      date,
      window: "rolling_30d" as const,
      sources: {
        foundYou: "gbp_performance" as const,
        contactedYou: "gbp_performance" as const,
      },
      foundYou,
      contactedYou,
      newReviews: 0,
      growthScore: 0,
      reviewsScore: 0,
      profileScore: 0,
    };
  });
}

function utcDateRange(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const dates: string[] = [];
  for (let time = start; time <= end; time += 86_400_000) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  return dates;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildSnapshot(
  location: Location,
  rating: number,
  reviewCount: number,
  reviews: Review[],
  nowIso: string,
): MetricSnapshot {
  const now = new Date(nowIso).getTime();
  const mostRecent = reviews
    .map((r) => r.publishedAt)
    .filter(Boolean)
    .sort()
    .pop();
  const scores = computePublicScore({
    rating,
    reviewCount,
    daysSinceLastReview: reviewCount > 0 ? daysSince(mostRecent, now) : 999,
    photoCount: location.profile.photoCount,
    responseRate: location.profile.responseRate,
    profileCompleteness: location.profile.completeness,
  });
  return {
    locationId: location.id,
    date: nowIso.slice(0, 10),
    window: "rolling_30d",
    sources: { newReviews: "gbp_reviews", scores: "gbp_reviews" },
    foundYou: 0,
    contactedYou: 0,
    newReviews: reviews.filter((review) => {
      const published = new Date(review.publishedAt).getTime();
      return Number.isFinite(published) && now - published <= 30 * 86_400_000;
    }).length,
    growthScore: scores.growth,
    reviewsScore: scores.reviews,
    profileScore: scores.profile,
  };
}
