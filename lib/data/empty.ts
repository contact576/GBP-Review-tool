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
    campaigns: [],
    subscription: {
      id: `sub_${input.workspaceId}`,
      workspaceId: input.workspaceId,
      tier: "growth",
      interval: "monthly",
      status: "trialing",
      trialEndsAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
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
      { id: `int_resend_${locationId}`, locationId, provider: "resend", label: "Email delivery", status: "pending", detail: "Email sending activates once the platform email service is configured" },
      { id: `int_twilio_${locationId}`, locationId, provider: "twilio", label: "SMS (A2P 10DLC)", status: "disconnected", detail: "SMS requires carrier registration (1–5 days)" },
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
    platform: {
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
    },
  };
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
  const suffix = salt.replace(/^ws_/, "").slice(0, 6);
  return base ? `${base}-${suffix}` : suffix;
}
