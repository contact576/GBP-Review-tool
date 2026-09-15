import { trialEndsFrom } from "@/lib/billing/plans";
import type { FoundlyData, Region } from "./types";

/**
 * Canonical empty dataset for a freshly-registered workspace.
 * Every collection is empty and every scalar is a truthful zero state, so all
 * screens render guided empty states instead of crashing or faking numbers.
 */
export interface NewWorkspaceInput {
  workspaceId: string;
  organizationId: string;
  userId: string;
  businessName: string;
  ownerName: string;
  email: string;
  industryKey: string;
  category: string;
  region: Region;
  city?: string;
  address?: string;
  googlePlaceId?: string;
  rating?: number;
  reviewCount?: number;
}

export function emptyFoundlyData(input: NewWorkspaceInput): FoundlyData {
  const now = new Date().toISOString();
  const locationId = `loc_${input.workspaceId.replace(/^ws_/, "")}`;
  const reviewUrl = input.googlePlaceId
    ? `https://search.google.com/local/writereview?placeid=${input.googlePlaceId}`
    : "";

  return {
    organization: {
      id: input.organizationId,
      name: input.businessName,
      legalName: input.businessName,
      region: input.region,
      orgType: "direct",
      billingEmail: input.email,
    },
    workspace: {
      id: input.workspaceId,
      organizationId: input.organizationId,
      name: input.businessName,
      vertical: input.industryKey,
      region: input.region,
      timezone: input.region === "CA" ? "America/Toronto" : "America/New_York",
      plan: "growth",
      createdAt: now,
      isDemo: false,
      settings: {
        serviceConsentDefault: true,
        marketingOptInVisible: true,
        quietHours: true,
        leaderboardVisible: true,
      },
    },
    location: {
      id: locationId,
      workspaceId: input.workspaceId,
      name: input.businessName,
      category: input.category,
      vertical: input.industryKey,
      address: input.address ?? "",
      city: input.city ?? "",
      region: input.region,
      timezone: input.region === "CA" ? "America/Toronto" : "America/New_York",
      googlePlaceId: input.googlePlaceId,
      reviewUrl,
      rating: input.rating ?? 0,
      reviewCount: input.reviewCount ?? 0,
      joinedAt: now,
      gbpConnected: false,
      profile: {
        description: "",
        primaryCategory: input.category,
        secondaryCategories: [],
        photoCount: 0,
        postCount: 0,
        qnaCount: 0,
        hoursSet: false,
        holidayHoursSet: false,
        servicesWithDescriptions: 0,
        servicesTotal: 0,
        responseRate: 0,
        completeness: 10,
      },
    },
    owner: {
      id: input.userId,
      email: input.email,
      name: input.ownerName,
      role: "owner",
      workspaceId: input.workspaceId,
      twoFactorEnabled: false,
      avatarInitials: initialsOf(input.ownerName),
    },
    invites: [],
    staff: [],
    customers: [],
    requests: [],
    reviews: [],
    drafts: [],
    tasks: [],
    mutationJobs: [],
    campaigns: [],
    subscription: {
      id: `sub_${input.workspaceId}`,
      workspaceId: input.workspaceId,
      tier: "growth",
      interval: "monthly",
      status: "trialing",
      trialEndsAt: trialEndsFrom(),
      currency: input.region === "CA" ? "CAD" : "USD",
      usage: {
        aiDraftsUsed: 0,
        aiDraftsLimit: -1,
        smsCreditsUsed: 0,
        smsCreditsTotal: 250,
        requestsSent: 0,
        reviewsCaptured: 0,
      },
    },
    invoices: [],
    competitors: [],
    metrics: [],
    aeo: {
      locationId,
      date: now.slice(0, 10),
      namedFraction: { named: 0, total: 0 },
      queries: [],
    },
    rankScans: [],
    qrAssets: [
      {
        id: `qr_${locationId}`,
        locationId,
        scope: "location",
        label: "Front desk QR",
        slug: makeSlug(input.businessName, input.workspaceId),
        targetUrl: reviewUrl,
        scans: 0,
        pageOpens: 0,
        degraded: false,
      },
    ],
    widgets: [],
    milestones: [],
    suppression: [],
    integrations: [
      { id: `int_google_${locationId}`, locationId, provider: "google", label: "Google Business Profile", status: "disconnected", detail: "Connect to import your reviews and profile data" },
      { id: `int_places_${locationId}`, locationId, provider: "google_places", label: "Google business lookup", status: input.googlePlaceId ? "connected" : "disconnected", detail: input.googlePlaceId ? "Business matched on Google" : "Find your business to link your Google review page" },
      { id: `int_website_${locationId}`, locationId, provider: "website", label: "Business website", status: "disconnected", detail: "A verified website URL is required for fact cross-checking" },
      { id: `int_search_console_${locationId}`, locationId, provider: "search_console", label: "Google Search Console", status: "disconnected", detail: "Reconnect Google with read-only Search Console access" },
      { id: `int_instagram_${locationId}`, locationId, provider: "instagram", label: "Instagram professional account", status: "disconnected", detail: "Connect an authorized Business or Creator account" },
      { id: `int_resend_${locationId}`, locationId, provider: "resend", label: "Email delivery", status: "pending", detail: "Email sending activates once the platform email service is configured" },
      { id: `int_twilio_${locationId}`, locationId, provider: "twilio", label: "SMS (Twilio)", status: "disconnected", detail: "SMS not configured — review requests fall back to email" },
      { id: `int_stripe_${locationId}`, locationId, provider: "stripe", label: "Billing", status: "pending", detail: "Trial active — payment method not required yet" },
    ],
    auditLog: [],
    featureFlags: [],
    notifications: [
      {
        id: `ntf_welcome_${locationId}`,
        locationId,
        kind: "system",
        title: "Welcome to Foundly",
        body: "Finish setup: find your business on Google, download your QR code, and send your first review request.",
        createdAt: now,
        read: false,
      },
    ],
    privateFeedback: [],
    reports: [],
    agency: {
      id: `agc_${input.workspaceId}`,
      organizationId: input.organizationId,
      name: input.businessName,
      clients: [],
      wholesaleRate: 59,
      retailAverage: 149,
      whiteLabel: {
        brandName: input.businessName,
        primary: "#0C7A63",
        primaryDark: "#085546",
        accent: "#E8A33D",
        logoText: input.businessName,
        contrastValid: true,
      },
    },
    // PLACEHOLDERS — NOT TELEMETRY. See `hasNoPlatformTelemetry` below.
    // Nothing in this deployment aggregates platform-wide numbers: this blob is
    // written once, at workspace creation, and never recomputed. The zeros are
    // "we have not measured", not "we measured and it is zero".
    platform: emptyPlatform(),
  };
}

/**
 * True when a workspace's `platform` blob carries no measurement at all — an
 * empty roster AND every KPI at zero.
 *
 * This is the single source of truth for the admin console's third state.
 * Because no aggregation job ever writes this blob for a real deployment, an
 * all-empty/all-zero blob is indistinguishable from "monitoring was never
 * connected". Rendering it as a zero (or as a green severity chip) would claim
 * a healthy platform we cannot actually observe, so every admin panel must
 * route this through an explicit "Not measured" state instead.
 *
 * Forward-compatible: the moment any real aggregate lands — one tenant, one
 * incident, one non-zero KPI — this returns false and the console shows the
 * measured values, including honest zeros for the sub-signals that are
 * genuinely clear.
 */
/** The never-measured platform blob: zeros that mean "not measured", not "zero". */
export function emptyPlatform(): FoundlyData["platform"] {
  return {
    tenants: [],
    deliveryIncidents: [],
    fraudFlags: [],
    durability: [],
    kpis: {
      totalTenants: 0,
      activeLocations: 0,
      mrr: 0,
      trialConversion: 0,
      logoChurn: 0,
      nrr: 0,
      weeklyDetectedReviews: 0,
    },
  };
}

export function hasNoPlatformTelemetry(platform: FoundlyData["platform"]): boolean {
  // A snapshot computed live is measured even when every count is zero.
  if (platform.measuredAt) return false;
  const rosterEmpty =
    platform.tenants.length === 0 &&
    platform.deliveryIncidents.length === 0 &&
    platform.fraudFlags.length === 0 &&
    platform.durability.length === 0;
  const kpisZeroed = Object.values(platform.kpis).every((n) => n === 0);
  return rosterEmpty && kpisZeroed;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function makeSlug(businessName: string, salt: string): string {
  const base = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  // IDs are generated with Nano ID and may contain uppercase, `_`, or `-`.
  // Normalize the public slug to a URL-safe lowercase alphabet and retain
  // enough entropy to avoid collisions between similarly named tenants.
  const suffix = salt
    .replace(/^ws[_-]?/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
  return base ? `${base}-${suffix}` : suffix;
}
