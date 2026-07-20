import "server-only";
import type {
  GbpAttributeValue,
  GbpLocalPost,
  GbpLocationRecord,
  GbpMediaItem,
  GbpQuestion,
  GbpSearchKeyword,
  GbpServiceItem,
} from "@/lib/data/types";
import { googleClientId, googleClientSecret } from "./config";

/**
 * Google Business Profile APIs — typed, approval-aware client (server-only).
 *
 * IMPORTANT — GBP API access is gated by Google, per project:
 *  1. Enable "My Business Account Management API" and "My Business Business
 *     Information API" in the Google Cloud console for your project.
 *  2. Request GBP API access for the project — prerequisites:
 *     https://developers.google.com/my-business/content/prereqs
 *     application form:
 *     https://support.google.com/business/contact/api_default
 *  Approval is granted per-project and typically takes 1–2 weeks. Until then,
 *  calls fail with 403s that this module classifies as `not_approved` so the
 *  UI can tell the truth instead of pretending the connection works.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ACCOUNTS_ENDPOINT = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
/** Reviews live on the legacy v4 surface (no v1 equivalent exists yet). */
const REVIEWS_V4_BASE = "https://mybusiness.googleapis.com/v4";
const PERFORMANCE_BASE = "https://businessprofileperformance.googleapis.com/v1";
const QANDA_BASE = "https://mybusinessqanda.googleapis.com/v1";

export const LOCATION_READ_MASK = [
  "name",
  "languageCode",
  "storeCode",
  "title",
  "phoneNumbers",
  "categories",
  "storefrontAddress",
  "websiteUri",
  "regularHours",
  "specialHours",
  "serviceArea",
  "labels",
  "latlng",
  "openInfo",
  "metadata",
  "profile",
  "relationshipData",
  "moreHours",
  "serviceItems",
].join(",");

export type GbpResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "not_approved" | "unauthorized" | "error"; detail: string };

export interface GbpAccount {
  /** Resource name, e.g. "accounts/1234567890". */
  name: string;
  accountName?: string;
  type?: string;
  verificationState?: string;
}

export interface GbpLocation extends GbpLocationRecord {
  /** Resource name, e.g. "locations/1234567890". */
  name: string;
  title?: string;
  storefrontAddress?: {
    addressLines?: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    regionCode?: string;
  };
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
}

type RawLocation = Omit<GbpLocationRecord, "serviceItems"> & {
  serviceItems?: Array<{
    structuredServiceItem?: {
      serviceTypeId?: string;
      description?: string;
    };
    freeFormServiceItem?: {
      category?: string;
      label?: { displayName?: string; description?: string; languageCode?: string };
    };
    price?: { currencyCode?: string; units?: string; nanos?: number };
  }>;
};

/** Normalize Google's union-based service item representation for storage and audit. */
export function normalizeGbpLocation(raw: RawLocation): GbpLocation {
  return {
    ...raw,
    serviceItems: (raw.serviceItems ?? []).map(normalizeServiceItem),
  };
}

function normalizeServiceItem(raw: NonNullable<RawLocation["serviceItems"]>[number]): GbpServiceItem {
  if (raw.structuredServiceItem) {
    return {
      serviceTypeId: raw.structuredServiceItem.serviceTypeId,
      name: raw.structuredServiceItem.serviceTypeId,
      description: raw.structuredServiceItem.description,
      price: raw.price,
      source: "structured",
    };
  }
  if (raw.freeFormServiceItem) {
    return {
      name: raw.freeFormServiceItem.label?.displayName,
      description: raw.freeFormServiceItem.label?.description,
      categoryName: raw.freeFormServiceItem.category,
      price: raw.price,
      source: "free_form",
    };
  }
  return { price: raw.price, source: "unknown" };
}

/** Mint a fresh access token from a stored (decrypted) refresh token. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<GbpResult<{ accessToken: string; expiresIn: number }>> {
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: googleClientId(),
        client_secret: googleClientSecret(),
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) {
      if (res.status === 400 || res.status === 401) {
        return {
          ok: false,
          reason: "unauthorized",
          detail: "Refresh token was revoked or expired — reconnect Google.",
        };
      }
      return { ok: false, reason: "error", detail: `Token refresh ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = JSON.parse(body) as { access_token?: string; expires_in?: number };
    if (typeof data.access_token !== "string") {
      return { ok: false, reason: "error", detail: "Token refresh returned no access_token." };
    }
    return {
      ok: true,
      data: { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 },
    };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message : "Network error refreshing token",
    };
  }
}

/** List GBP accounts the connected Google user can manage. */
export async function listAccounts(accessToken: string): Promise<GbpResult<GbpAccount[]>> {
  const accounts: GbpAccount[] = [];
  let pageToken: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 100; page += 1) {
    const url = new URL(ACCOUNTS_ENDPOINT);
    url.searchParams.set("pageSize", "20");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = await gbpGet<
      { accounts?: GbpAccount[]; nextPageToken?: string },
      { accounts: GbpAccount[]; nextPageToken?: string }
    >(url.toString(), accessToken, (body) => ({
      accounts: body.accounts ?? [],
      nextPageToken: body.nextPageToken,
    }));
    if (!result.ok) return result;
    accounts.push(...result.data.accounts);
    pageToken = result.data.nextPageToken;
    if (!pageToken || seen.has(pageToken)) break;
    seen.add(pageToken);
  }
  return { ok: true, data: accounts };
}

/**
 * List locations under an account (resource name like "accounts/123").
 * readMask keeps the payload small: name, title, address, metadata.
 */
export async function listLocations(
  accessToken: string,
  account: string,
): Promise<GbpResult<GbpLocation[]>> {
  const locations: GbpLocation[] = [];
  let pageToken: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 100; page += 1) {
    const url = new URL(`${INFO_BASE}/${account}/locations`);
    url.searchParams.set("readMask", "name,title,storefrontAddress,metadata");
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = await gbpGet<
      { locations?: GbpLocation[]; nextPageToken?: string },
      { locations: GbpLocation[]; nextPageToken?: string }
    >(url.toString(), accessToken, (body) => ({
      locations: body.locations ?? [],
      nextPageToken: body.nextPageToken,
    }));
    if (!result.ok) return result;
    locations.push(...result.data.locations);
    pageToken = result.data.nextPageToken;
    if (!pageToken || seen.has(pageToken)) break;
    seen.add(pageToken);
  }
  return { ok: true, data: locations };
}

/** Fetch the complete editable Business Information record for one location. */
export async function getLocation(
  accessToken: string,
  locationName: string,
): Promise<GbpResult<GbpLocation>> {
  const url = new URL(`${INFO_BASE}/${locationName}`);
  url.searchParams.set("readMask", LOCATION_READ_MASK);
  return gbpGet<RawLocation, GbpLocation>(url.toString(), accessToken, normalizeGbpLocation);
}

/** Fetch values currently configured on the profile. */
export async function getLocationAttributes(
  accessToken: string,
  locationName: string,
): Promise<GbpResult<GbpAttributeValue[]>> {
  return gbpGet<
    { attributes?: RawAttribute[] },
    GbpAttributeValue[]
  >(`${INFO_BASE}/${locationName}/attributes`, accessToken, (body) =>
    (body.attributes ?? []).map(mapAttribute),
  );
}

/** Patch only the explicitly named Business Information fields. */
export async function patchLocation(
  accessToken: string,
  locationName: string,
  updateMask: readonly string[],
  patch: Record<string, unknown>,
): Promise<GbpResult<GbpLocation>> {
  if (!updateMask.length) {
    return { ok: false, reason: "error", detail: "A non-empty Google update mask is required." };
  }
  const url = new URL(`${INFO_BASE}/${locationName}`);
  url.searchParams.set("updateMask", updateMask.join(","));
  return gbpWrite<RawLocation, GbpLocation>(
    url.toString(),
    accessToken,
    "PATCH",
    { name: locationName, ...patch },
    normalizeGbpLocation,
  );
}

/** Patch the exact attribute values selected for this location. */
export async function patchLocationAttributes(
  accessToken: string,
  locationName: string,
  attributeMask: readonly string[],
  attributes: readonly GbpAttributeValue[],
): Promise<GbpResult<GbpAttributeValue[]>> {
  if (!attributeMask.length) {
    return { ok: false, reason: "error", detail: "A non-empty Google attribute mask is required." };
  }
  const url = new URL(`${INFO_BASE}/${locationName}/attributes`);
  url.searchParams.set("attributeMask", attributeMask.join(","));
  return gbpWrite<{ attributes?: RawAttribute[] }, GbpAttributeValue[]>(
    url.toString(),
    accessToken,
    "PATCH",
    { name: `${locationName}/attributes`, attributes },
    (body) => (body.attributes ?? []).map(mapAttribute),
  );
}

/** Discover attributes Google currently permits for this exact location. */
export async function listAvailableAttributes(
  accessToken: string,
  locationName: string,
): Promise<GbpResult<GbpAttributeValue[]>> {
  const values: GbpAttributeValue[] = [];
  let pageToken: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 100; page += 1) {
    const url = new URL(`${INFO_BASE}/attributes`);
    url.searchParams.set("parent", locationName);
    url.searchParams.set("pageSize", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = await gbpGet<
      { attributeMetadata?: RawAttributeMetadata[]; nextPageToken?: string },
      { values: GbpAttributeValue[]; nextPageToken?: string }
    >(url.toString(), accessToken, (body) => ({
      values: (body.attributeMetadata ?? []).map(mapAttributeMetadata),
      nextPageToken: body.nextPageToken,
    }));
    if (!result.ok) return result;
    values.push(...result.data.values);
    pageToken = result.data.nextPageToken;
    if (!pageToken || seen.has(pageToken)) break;
    seen.add(pageToken);
  }
  return { ok: true, data: values };
}

interface RawAttribute {
  name?: string;
  valueType?: string;
  values?: unknown[];
  repeatedEnumValue?: { setValues?: string[]; unsetValues?: string[] };
  uriValues?: Array<{ uri?: string }>;
}

interface RawAttributeMetadata {
  parent?: string;
  attributeId?: string;
  displayName?: string;
  valueType?: string;
}

function mapAttribute(raw: RawAttribute): GbpAttributeValue {
  return {
    name: raw.name ?? "",
    valueType: raw.valueType,
    values: raw.values,
    setValues: raw.repeatedEnumValue?.setValues,
    unsetValues: raw.repeatedEnumValue?.unsetValues,
    uriValues: raw.uriValues?.flatMap((value) => value.uri ? [{ uri: value.uri }] : []),
  };
}

function mapAttributeMetadata(raw: RawAttributeMetadata): GbpAttributeValue {
  return {
    name: raw.attributeId ?? raw.parent ?? "",
    displayName: raw.displayName,
    valueType: raw.valueType,
  };
}

export interface GbpGoogleUpdatedLocation {
  location?: GbpLocation;
  diffMask: string[];
  pendingMask: string[];
}

/** Read Google-originated and pending edits so the audit can surface contradictions. */
export async function getGoogleUpdatedLocation(
  accessToken: string,
  locationName: string,
): Promise<GbpResult<GbpGoogleUpdatedLocation>> {
  const url = new URL(`${INFO_BASE}/${locationName}:getGoogleUpdated`);
  url.searchParams.set("readMask", LOCATION_READ_MASK);
  return gbpGet<
    { location?: RawLocation; diffMask?: string | string[]; pendingMask?: string | string[] },
    GbpGoogleUpdatedLocation
  >(url.toString(), accessToken, (body) => ({
    location: body.location ? normalizeGbpLocation(body.location) : undefined,
    diffMask: normalizeFieldMask(body.diffMask),
    pendingMask: normalizeFieldMask(body.pendingMask),
  }));
}

function normalizeFieldMask(mask: string | string[] | undefined): string[] {
  if (Array.isArray(mask)) return mask.filter(Boolean);
  return typeof mask === "string" ? mask.split(",").map((value) => value.trim()).filter(Boolean) : [];
}

// ── Original Google media, posts and Q&A ──────────────────────────────────────

interface RawMediaItem {
  name?: string;
  mediaFormat?: string;
  locationAssociation?: { category?: string; priceListItemId?: string };
  googleUrl?: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  createTime?: string;
  description?: string;
  dimensions?: { widthPixels?: number; heightPixels?: number };
  insights?: { viewCount?: string };
  attribution?: GbpMediaItem["attribution"];
}

function mapMediaItem(raw: RawMediaItem): GbpMediaItem {
  return {
    name: raw.name ?? "",
    mediaFormat: raw.mediaFormat,
    category: raw.locationAssociation?.category,
    priceListItemId: raw.locationAssociation?.priceListItemId,
    googleUrl: raw.googleUrl,
    thumbnailUrl: raw.thumbnailUrl,
    sourceUrl: raw.sourceUrl,
    createTime: raw.createTime,
    description: raw.description,
    widthPixels: raw.dimensions?.widthPixels,
    heightPixels: raw.dimensions?.heightPixels,
    viewCount: raw.insights?.viewCount,
    attribution: raw.attribution,
  };
}

export async function listMedia(
  accessToken: string,
  accountLocationResource: string,
): Promise<GbpResult<GbpMediaItem[]>> {
  return collectPages<RawMediaItem, GbpMediaItem>(
    `${REVIEWS_V4_BASE}/${accountLocationResource}/media`,
    accessToken,
    "mediaItems",
    mapMediaItem,
    2500,
  );
}

interface RawLocalPost extends Omit<GbpLocalPost, "name" | "media"> {
  name?: string;
  media?: RawMediaItem[];
}

export async function listLocalPosts(
  accessToken: string,
  accountLocationResource: string,
): Promise<GbpResult<GbpLocalPost[]>> {
  return collectPages<RawLocalPost, GbpLocalPost>(
    `${REVIEWS_V4_BASE}/${accountLocationResource}/localPosts`,
    accessToken,
    "localPosts",
    (raw) => ({ ...raw, name: raw.name ?? "", media: raw.media?.map(mapMediaItem) }),
    100,
  );
}

interface RawQuestion {
  name?: string;
  text?: string;
  author?: { displayName?: string };
  createTime?: string;
  updateTime?: string;
  upvoteCount?: number;
  totalAnswerCount?: number;
  topAnswers?: Array<{
    name?: string;
    text?: string;
    author?: { displayName?: string };
    upvoteCount?: number;
    createTime?: string;
    updateTime?: string;
  }>;
}

export async function listQuestions(
  accessToken: string,
  locationName: string,
): Promise<GbpResult<GbpQuestion[]>> {
  return collectPages<RawQuestion, GbpQuestion>(
    `${QANDA_BASE}/${locationName}/questions`,
    accessToken,
    "questions",
    (raw) => ({
      name: raw.name ?? "",
      text: raw.text,
      authorName: raw.author?.displayName,
      createTime: raw.createTime,
      updateTime: raw.updateTime,
      upvoteCount: raw.upvoteCount,
      totalAnswerCount: raw.totalAnswerCount,
      topAnswers: raw.topAnswers?.map((answer) => ({
        name: answer.name,
        text: answer.text,
        authorName: answer.author?.displayName,
        upvoteCount: answer.upvoteCount,
        createTime: answer.createTime,
        updateTime: answer.updateTime,
      })),
    }),
    10,
    { answersPerQuestion: "10", orderBy: "updateTime desc" },
  );
}

async function collectPages<Raw, Mapped>(
  endpoint: string,
  accessToken: string,
  collectionKey: string,
  map: (raw: Raw) => Mapped,
  pageSize: number,
  extraParams: Record<string, string> = {},
): Promise<GbpResult<Mapped[]>> {
  const values: Mapped[] = [];
  let pageToken: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 200; page += 1) {
    const url = new URL(endpoint);
    url.searchParams.set("pageSize", String(pageSize));
    for (const [key, value] of Object.entries(extraParams)) url.searchParams.set(key, value);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = await gbpGet<Record<string, unknown>, { raw: Raw[]; nextPageToken?: string }>(
      url.toString(),
      accessToken,
      (body) => ({
        raw: Array.isArray(body[collectionKey]) ? body[collectionKey] as Raw[] : [],
        nextPageToken: typeof body.nextPageToken === "string" ? body.nextPageToken : undefined,
      }),
    );
    if (!result.ok) return result;
    values.push(...result.data.raw.map(map));
    pageToken = result.data.nextPageToken;
    if (!pageToken || seen.has(pageToken)) break;
    seen.add(pageToken);
  }
  return { ok: true, data: values };
}

// ── Reviews (owned-profile history) ────────────────────────────────────────

export interface GbpReview {
  reviewId: string;
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  createTime?: string;
  reply?: string;
}

export interface GbpReviewsPage {
  reviews: GbpReview[];
  averageRating: number;
  totalReviewCount: number;
}

interface RawGbpReview {
  reviewId?: string;
  reviewer?: { displayName?: string };
  starRating?: string;
  comment?: string;
  createTime?: string;
  reviewReply?: { comment?: string };
}

/** GBP star enum → 1–5 integer. Exported for unit testing. */
export function mapGbpStarRating(star: string | undefined): 1 | 2 | 3 | 4 | 5 {
  switch (star) {
    case "ONE":
      return 1;
    case "TWO":
      return 2;
    case "THREE":
      return 3;
    case "FOUR":
      return 4;
    case "FIVE":
      return 5;
    default:
      return 5;
  }
}

/** Map one raw GBP review to our shape. Exported for unit testing. */
export function mapGbpReview(raw: RawGbpReview): GbpReview {
  return {
    reviewId: raw.reviewId ?? "",
    author: raw.reviewer?.displayName ?? "A Google user",
    rating: mapGbpStarRating(raw.starRating),
    text: raw.comment ?? "",
    createTime: raw.createTime,
    reply: raw.reviewReply?.comment,
  };
}

/**
 * List reviews for a location (resource "accounts/{a}/locations/{l}").
 * One page (up to 50) — enough to seed the dashboard; pagination can be added
 * once the project is approved and we can exercise it against real data.
 */
export async function listReviews(
  accessToken: string,
  locationResource: string,
): Promise<GbpResult<GbpReviewsPage>> {
  const reviews: GbpReview[] = [];
  const ids = new Set<string>();
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;
  let averageRating = 0;
  let totalReviewCount = 0;

  for (let page = 0; page < 200; page += 1) {
    const url = new URL(`${REVIEWS_V4_BASE}/${locationResource}/reviews`);
    url.searchParams.set("pageSize", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = await gbpGet<
      {
        reviews?: RawGbpReview[];
        averageRating?: number;
        totalReviewCount?: number;
        nextPageToken?: string;
      },
      {
        reviews: RawGbpReview[];
        averageRating?: number;
        totalReviewCount?: number;
        nextPageToken?: string;
      }
    >(url.toString(), accessToken, (body) => ({
      reviews: body.reviews ?? [],
      averageRating: body.averageRating,
      totalReviewCount: body.totalReviewCount,
      nextPageToken: body.nextPageToken,
    }));
    if (!result.ok) return result;
    if (page === 0) {
      averageRating = result.data.averageRating ?? 0;
      totalReviewCount = result.data.totalReviewCount ?? 0;
    }
    for (const raw of result.data.reviews) {
      const mapped = mapGbpReview(raw);
      const key = mapped.reviewId || `${mapped.author}:${mapped.createTime ?? reviews.length}`;
      if (!ids.has(key)) {
        ids.add(key);
        reviews.push(mapped);
      }
    }
    pageToken = result.data.nextPageToken;
    if (!pageToken || seenTokens.has(pageToken)) break;
    seenTokens.add(pageToken);
  }

  return {
    ok: true,
    data: {
      reviews,
      averageRating,
      totalReviewCount: totalReviewCount || reviews.length,
    },
  };
}

export const PERFORMANCE_DAILY_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "CALL_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "WEBSITE_CLICKS",
] as const;

export type PerformanceDailyMetric = (typeof PERFORMANCE_DAILY_METRICS)[number];

export interface GbpDailyMetricValue {
  date: string;
  value: number;
}

/** Fetch the real search phrases Google reports for a profile over an inclusive month range. */
export async function listSearchKeywordImpressions(
  accessToken: string,
  locationId: string,
  startMonth: string,
  endMonth: string,
): Promise<GbpResult<GbpSearchKeyword[]>> {
  const start = monthParts(startMonth);
  const end = monthParts(endMonth);
  if (!start || !end) {
    return { ok: false, reason: "error", detail: "Invalid search-keyword month range." };
  }
  const values: GbpSearchKeyword[] = [];
  let pageToken: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 200; page += 1) {
    const url = new URL(
      `${PERFORMANCE_BASE}/locations/${encodeURIComponent(locationId)}/searchkeywords/impressions/monthly`,
    );
    url.searchParams.set("monthlyRange.startMonth.year", String(start.year));
    url.searchParams.set("monthlyRange.startMonth.month", String(start.month));
    url.searchParams.set("monthlyRange.endMonth.year", String(end.year));
    url.searchParams.set("monthlyRange.endMonth.month", String(end.month));
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = await gbpGet<
      {
        searchKeywordsCounts?: Array<{
          searchKeyword?: string;
          insightsValue?: { value?: string; threshold?: string };
        }>;
        nextPageToken?: string;
      },
      { values: GbpSearchKeyword[]; nextPageToken?: string }
    >(url.toString(), accessToken, (body) => ({
      values: (body.searchKeywordsCounts ?? []).flatMap((entry) =>
        entry.searchKeyword
          ? [{
              keyword: entry.searchKeyword,
              impressions: finiteNumber(entry.insightsValue?.value),
              threshold: finiteNumber(entry.insightsValue?.threshold),
            }]
          : [],
      ),
      nextPageToken: body.nextPageToken,
    }));
    if (!result.ok) return result;
    values.push(...result.data.values);
    pageToken = result.data.nextPageToken;
    if (!pageToken || seen.has(pageToken)) break;
    seen.add(pageToken);
  }
  return { ok: true, data: values };
}

/** Fetch one official GBP Performance daily metric time series. */
export async function getDailyMetricTimeSeries(
  accessToken: string,
  locationId: string,
  dailyMetric: PerformanceDailyMetric,
  startDate: string,
  endDate: string,
): Promise<GbpResult<GbpDailyMetricValue[]>> {
  const start = dateParts(startDate);
  const end = dateParts(endDate);
  if (!start || !end) {
    return { ok: false, reason: "error", detail: "Invalid performance date range." };
  }
  const url = new URL(
    `${PERFORMANCE_BASE}/locations/${encodeURIComponent(locationId)}:getDailyMetricsTimeSeries`,
  );
  url.searchParams.set("dailyMetric", dailyMetric);
  url.searchParams.set("dailyRange.startDate.year", String(start.year));
  url.searchParams.set("dailyRange.startDate.month", String(start.month));
  url.searchParams.set("dailyRange.startDate.day", String(start.day));
  url.searchParams.set("dailyRange.endDate.year", String(end.year));
  url.searchParams.set("dailyRange.endDate.month", String(end.month));
  url.searchParams.set("dailyRange.endDate.day", String(end.day));

  return gbpGet<
    {
      timeSeries?: {
        datedValues?: Array<{
          date?: { year?: number; month?: number; day?: number };
          value?: string;
        }>;
      };
    },
    GbpDailyMetricValue[]
  >(url.toString(), accessToken, (body) =>
    (body.timeSeries?.datedValues ?? []).flatMap((entry) => {
      const year = entry.date?.year;
      const month = entry.date?.month;
      const day = entry.date?.day;
      if (!year || !month || !day) return [];
      const value = Number(entry.value ?? 0);
      return [
        {
          date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          value: Number.isFinite(value) && value > 0 ? value : 0,
        },
      ];
    }),
  );
}

function dateParts(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function monthParts(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

function finiteNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// ── Shared fetch + approval-aware error classification ─────────────────────

async function gbpGet<Body, T>(
  url: string,
  accessToken: string,
  pick: (body: Body) => T,
): Promise<GbpResult<T>> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) return classifyError(res.status, text);
    const body = JSON.parse(text || "{}") as Body;
    return { ok: true, data: pick(body) };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message : "Network error reaching GBP API",
    };
  }
}

async function gbpWrite<Body, T>(
  url: string,
  accessToken: string,
  method: "PATCH" | "POST" | "DELETE",
  body: unknown,
  pick: (body: Body) => T,
): Promise<GbpResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: method === "DELETE" ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const responseText = await res.text().catch(() => "");
    if (!res.ok) return classifyError(res.status, responseText);
    return { ok: true, data: pick(JSON.parse(responseText || "{}") as Body) };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message : "Network error reaching GBP API",
    };
  }
}

/**
 * 403s from a project that hasn't been approved for the GBP APIs come back
 * as SERVICE_DISABLED / accessNotConfigured / "has not been used in project"
 * — surface those as `not_approved` (an expected, honest waiting state),
 * not as a generic failure.
 */
function classifyError(status: number, body: string): GbpResult<never> {
  const snippet = body.slice(0, 300);
  if (status === 401) {
    return { ok: false, reason: "unauthorized", detail: "Access token expired or invalid." };
  }
  if (status === 403) {
    const lower = body.toLowerCase();
    if (
      lower.includes("has not been used in project") ||
      lower.includes("disabled") ||
      lower.includes("service_disabled") ||
      lower.includes("accessnotconfigured")
    ) {
      return {
        ok: false,
        reason: "not_approved",
        detail:
          "GBP API not enabled/approved for this Google Cloud project yet. " +
          "Enable the My Business APIs and request access: " +
          "https://developers.google.com/my-business/content/prereqs",
      };
    }
    return { ok: false, reason: "unauthorized", detail: `403 from GBP API: ${snippet}` };
  }
  return { ok: false, reason: "error", detail: `GBP API ${status}: ${snippet}` };
}
