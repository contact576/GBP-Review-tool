import type {
  FoundlyData,
  Customer,
  CustomerConsent,
  Review,
  ReviewRequest,
  MetricSnapshot,
  StaffMember,
} from "./types";

/**
 * The Harbourview Physiotherapy demo tenant.
 *
 * `buildSeed()` returns a fresh, deep-cloned dataset with timestamps relative
 * to "now", so the demo always looks live. Deterministic pseudo-randomness
 * keeps the shape stable across reloads.
 */

const DAY = 86_400_000;

function iso(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString();
}
const daysAgo = (n: number) => iso(n * DAY);
const hoursAgo = (n: number) => iso(n * 3_600_000);
const minsAgo = (n: number) => iso(n * 60_000);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY).toISOString();

function isoWeek(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Small deterministic RNG (mulberry32) for stable variety.
function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Dana", "Marcus", "Priya", "Aisha", "Liam", "Sofia", "Noah", "Emma", "Raj",
  "Chloe", "Ethan", "Maya", "Owen", "Zara", "Lucas", "Nadia", "Ben", "Grace",
  "Kwame", "Isla", "Tariq", "Freya", "Diego", "Hana", "Sam", "Olivia", "Yusuf",
  "Mia", "Leo", "Amara", "Jack", "Nina", "Omar", "Ruby", "Theo", "Lena", "Ravi",
  "Elsa", "Cole", "Anaya", "Beth", "Carlos",
];
const LAST = [
  "R.", "M.", "S.", "K.", "P.", "L.", "T.", "B.", "N.", "H.", "C.", "D.", "A.",
];

const SERVICES_POOL = [
  "Sports injury rehab", "Back pain treatment", "Post-surgery recovery",
  "Dry needling", "Manual therapy", "Shockwave therapy", "Pediatric physio",
  "Vestibular rehab", "Concussion care", "Direct billing",
];

const REVIEW_TEXTS = [
  "The team at Harbourview got me back on the ice after a nasty knee injury. Priya was patient and explained every step. Highly recommend.",
  "Came in with chronic lower back pain I'd had for years. Three months later I'm gardening again. Genuinely life-changing care.",
  "Dan is fantastic — professional, encouraging, and my shoulder feels stronger than before the surgery. Clean clinic, easy parking.",
  "Booked for dry needling on a stubborn calf knot. Immediate relief and they gave me exercises that actually worked.",
  "Friendly front desk, on-time appointments, and they do direct billing which made it painless. My physio really listened.",
  "After my concussion I was worried I'd never feel normal. The vestibular rehab program here brought me back. Thank you.",
  "My daughter needed pediatric physio and the team made her feel comfortable the whole way. She looks forward to going now.",
  "Great manual therapy for my frozen shoulder. Range of motion is way back. The exercise plan on the app is a nice touch.",
  "Honestly the best physio in the east end. Jonah pushed me just enough and I hit every recovery milestone early.",
  "Quick to get an appointment, thorough assessment, and no upselling. Just solid care that got results for my tennis elbow.",
];

function makeConsent(r: () => number, region: "US" | "CA"): CustomerConsent {
  const service = true; // service consent is required to have been asked
  const marketing = r() > 0.32;
  return {
    serviceConsent: service,
    serviceConsentAt: daysAgo(Math.floor(r() * 300) + 5),
    marketingConsent: marketing,
    marketingConsentAt: marketing ? daysAgo(Math.floor(r() * 300) + 5) : undefined,
    consentChannel: r() > 0.2 ? "in_person" : "web",
    consentSourceText:
      "Customer agreed to receive messages about their visit" +
      (marketing ? " and occasional offers." : "."),
    caslCaptured: region === "CA",
  };
}

export function buildSeed(): FoundlyData {
  const r = rng(20260711);
  const region: "US" | "CA" = "CA";
  const tz = "America/Toronto";
  const workspaceId = "ws_harbourview";
  const locationId = "loc_harbourview";
  const joinedAt = daysAgo(96);

  const reviewUrl = "https://search.google.com/local/writereview?placeid=ChIJharbourviewphysio";

  const staff: StaffMember[] = [
    {
      id: "stf_priya", locationId, displayName: "Priya Sharma", role: "manager",
      qrToken: "qr_priya", active: true, streakDays: 12, captures: 34,
      detectedReviews: 19, lastActiveAt: hoursAgo(2), avatarInitials: "PS",
    },
    {
      id: "stf_dan", locationId, displayName: "Dan O'Brien", role: "staff",
      qrToken: "qr_dan", active: true, streakDays: 5, captures: 21,
      detectedReviews: 11, lastActiveAt: hoursAgo(5), avatarInitials: "DO",
    },
    {
      id: "stf_jonah", locationId, displayName: "Jonah Weiss", role: "staff",
      qrToken: "qr_jonah", active: true, streakDays: 0, captures: 9,
      detectedReviews: 4, lastActiveAt: daysAgo(3), avatarInitials: "JW",
    },
  ];

  // ── Customers ─────────────────────────────────────────────
  const customers: Customer[] = [];
  for (let i = 0; i < 42; i++) {
    const first = FIRST[i % FIRST.length]!;
    const last = LAST[Math.floor(r() * LAST.length)]!;
    const hasEmail = r() > 0.15;
    const hasPhone = r() > 0.35;
    const visitCount = 1 + Math.floor(r() * 6);
    const staffPick = staff[Math.floor(r() * staff.length)]!;
    const suppressed = i >= 39; // last 3 suppressed
    const consent = makeConsent(r, region);
    const stage: Customer["lifecycleStage"] = suppressed
      ? "suppressed"
      : i < 8
        ? "reviewed"
        : i < 16
          ? "opened"
          : i < 30
            ? "requested"
            : "new";
    customers.push({
      id: `cus_${i}`,
      locationId,
      name: `${first} ${last}`,
      email: hasEmail ? `${first.toLowerCase()}.${i}@example.com` : undefined,
      phone: hasPhone ? `+1416555${String(1000 + i).padStart(4, "0")}` : undefined,
      createdAt: daysAgo(Math.floor(r() * 180) + 2),
      source: r() > 0.5 ? "staff" : r() > 0.5 ? "import" : "campaign",
      staffId: staffPick.id,
      visitCount,
      lastVisitAt: daysAgo(Math.floor(r() * 60)),
      lastRequestAt: stage === "new" ? undefined : daysAgo(Math.floor(r() * 30) + 1),
      services: [SERVICES_POOL[Math.floor(r() * SERVICES_POOL.length)]!],
      sentiment: i < 8 ? "happy" : i === 20 ? "unhappy" : "neutral",
      lifecycleStage: stage,
      consent,
      suppressedReason: suppressed
        ? ["Already reviewed", "Asked 12 days ago", "Opted out"][i - 39]
        : undefined,
      tags: visitCount >= 3 ? ["Regular"] : [],
    });
  }

  // ── Reviews (imported over ~18 months, denser recently) ────
  const reviews: Review[] = [];
  const reviewCount = 28;
  for (let i = 0; i < reviewCount; i++) {
    // Spread: recent 90d denser, older spaced out.
    const ageDays =
      i < 14 ? Math.floor(r() * 90) : 90 + Math.floor(r() * 460);
    const rating = (r() > 0.16 ? (r() > 0.4 ? 5 : 4) : 3) as 3 | 4 | 5;
    const needsReply = i < 5 && r() > 0.15;
    const durability: Review["durability"] =
      i === 6 ? "at_risk" : i === 9 ? "vanished" : "stable";
    reviews.push({
      id: `rev_${i}`,
      locationId,
      author: `${FIRST[(i * 3) % FIRST.length]!} ${LAST[i % LAST.length]!}`,
      rating,
      text: REVIEW_TEXTS[i % REVIEW_TEXTS.length]!,
      publishedAt: daysAgo(ageDays),
      source: "google",
      durability,
      vanishedAt: durability === "vanished" ? daysAgo(4) : undefined,
      matchedRequestId: i < 5 ? `req_posted_${i}` : undefined,
      matchConfidence: i < 5 ? 0.72 + r() * 0.24 : undefined,
      needsReply,
      reply: !needsReply && rating >= 4 && r() > 0.55
        ? {
            id: `rpl_${i}`,
            text: "Thank you so much for the kind words — it was a pleasure helping you get back to full strength. See you at your next check-in!",
            tone: "warm",
            source: "human",
            postedAt: daysAgo(Math.max(0, ageDays - 2)),
            approvedBy: "Owner",
          }
        : undefined,
    });
  }

  // ── Requests across every funnel state ────────────────────
  const requests: ReviewRequest[] = [];
  const statuses: { status: ReviewRequest["status"]; n: number }[] = [
    { status: "queued", n: 4 },
    { status: "sent", n: 6 },
    { status: "delivered", n: 3 },
    { status: "opened", n: 3 },
    { status: "clicked", n: 2 },
    { status: "posted_google", n: 5 },
    { status: "private_feedback", n: 2 },
    { status: "suppressed", n: 1 },
  ];
  let rIdx = 0;
  for (const { status, n } of statuses) {
    for (let k = 0; k < n; k++) {
      const cust = customers[rIdx % customers.length]!;
      const staffPick = staff[rIdx % staff.length]!;
      const rating =
        status === "posted_google" ? ((r() > 0.3 ? 5 : 4) as 4 | 5)
        : status === "private_feedback" ? ((r() > 0.5 ? 2 : 3) as 2 | 3)
        : undefined;
      requests.push({
        id: status === "posted_google" ? `req_posted_${k}` : `req_${rIdx}`,
        locationId,
        customerId: cust.id,
        customerName: cust.name,
        staffId: staffPick.id,
        channel: r() > 0.6 ? "email" : "sms",
        token: `tok_${rIdx}`,
        status,
        isTest: false,
        createdAt: daysAgo(Math.floor(r() * 20) + 1),
        sentAt: status === "queued" ? undefined : daysAgo(Math.floor(r() * 18) + 1),
        openedAt: ["opened", "clicked", "posted_google", "private_feedback"].includes(status)
          ? daysAgo(Math.floor(r() * 16) + 1) : undefined,
        clickedAt: ["clicked", "posted_google", "private_feedback"].includes(status)
          ? daysAgo(Math.floor(r() * 14) + 1) : undefined,
        rating,
        attributes:
          rating && rating >= 4 ? ["Friendly staff", cust.services[0] ?? "Great care"] : [],
        privateFeedback:
          status === "private_feedback"
            ? "The wait was longer than expected and I felt a bit rushed during the assessment."
            : undefined,
        suppressedReason: status === "suppressed" ? "Already reviewed" : undefined,
      });
      rIdx++;
    }
  }
  // A pinned live token the customer-review demo always resolves.
  requests.push({
    id: "req_live",
    locationId,
    customerId: customers[30]!.id,
    customerName: customers[30]!.name,
    staffId: "stf_priya",
    channel: "email",
    token: "demo",
    status: "sent",
    isTest: false,
    createdAt: hoursAgo(1),
    sentAt: hoursAgo(1),
    attributes: [],
  });

  // ── This week's 3 Co-Pilot tasks ──────────────────────────
  const week = isoWeek();
  const tasks = [
    {
      id: "task_post", locationId, isoWeek: week, kind: "post" as const,
      title: "Publish this week's update post",
      rationale: "You haven't posted in 18 days. Fresh posts feed the #1 local ranking signal.",
      preview: "New evening slots now open on Tuesdays & Thursdays — book online or call the clinic.",
      status: "suggested" as const, impact: "profile" as const, effortMins: 2, createdAt: daysAgo(1),
    },
    {
      id: "task_qna", locationId, isoWeek: week, kind: "qna" as const,
      title: "Answer a common customer question",
      rationale: "Searchers keep asking about direct billing. A seeded Q&A answers it before they call.",
      preview: "Q: Do you offer direct billing? A: Yes — we direct bill most major insurers so you pay little to nothing upfront.",
      status: "suggested" as const, impact: "profile" as const, effortMins: 1, createdAt: daysAgo(1),
    },
    {
      id: "task_reply", locationId, isoWeek: week, kind: "reply" as const,
      title: "Reply to Dana R.'s new 5★ review",
      rationale: "Replying within 48h lifts response rate and shows future customers you care.",
      preview: "Thank you, Dana! We're thrilled you're back on the ice — see you at your next check-in.",
      status: "approved" as const, impact: "reviews" as const, effortMins: 1, createdAt: daysAgo(1),
    },
  ];

  // ── Benchmark competitors ─────────────────────────────────
  const competitors = [
    { id: "cmp_you", locationId, name: "Harbourview Physiotherapy", rating: 4.7, reviewCount: 28, velocity30d: 5, isYou: true },
    { id: "cmp_1", locationId, name: "Riverside Physio & Rehab", rating: 4.5, reviewCount: 61, velocity30d: 8 },
    { id: "cmp_2", locationId, name: "Eastside Sports Clinic", rating: 4.6, reviewCount: 44, velocity30d: 6 },
    { id: "cmp_3", locationId, name: "Lakeshore Wellness", rating: 4.3, reviewCount: 33, velocity30d: 3 },
  ];

  // ── 90 daily metric snapshots (gentle upward trend) ───────
  const metrics: MetricSnapshot[] = [];
  for (let d = 90; d >= 0; d--) {
    const t = (90 - d) / 90; // 0..1 over time
    const noise = () => (r() - 0.5) * 0.15;
    metrics.push({
      locationId,
      date: daysAgo(d).slice(0, 10),
      window: "rolling_30d",
      sources: {
        foundYou: "demo",
        contactedYou: "demo",
        newReviews: "demo",
        scores: "demo",
      },
      foundYou: Math.round(1200 + t * 640 + t * noise() * 400),
      contactedYou: Math.round(58 + t * 44 + noise() * 20),
      newReviews: d % 7 === 0 ? Math.round(3 + t * 4) : Math.round(r() * 2),
      growthScore: Math.round(64 + t * 14 + noise() * 4),
      reviewsScore: Math.round(60 + t * 16 + noise() * 4),
      profileScore: Math.round(70 + t * 12 + noise() * 4),
    });
  }

  const now = metrics[metrics.length - 1]!;

  const data: FoundlyData = {
    organization: {
      id: "org_harbourview",
      name: "Harbourview Physiotherapy Inc.",
      legalName: "Harbourview Physiotherapy Inc.",
      region,
      orgType: "direct",
      billingEmail: "owner@harbourviewphysio.ca",
    },
    workspace: {
      id: workspaceId,
      organizationId: "org_harbourview",
      name: "Harbourview Physiotherapy",
      vertical: "physiotherapy",
      region,
      timezone: tz,
      plan: "growth",
      createdAt: joinedAt,
      isDemo: true,
      settings: {
        serviceConsentDefault: true,
        marketingOptInVisible: true,
        quietHours: true,
        leaderboardVisible: true,
      },
    },
    location: {
      id: locationId,
      workspaceId,
      name: "Harbourview Physiotherapy",
      category: "Physical therapy clinic",
      vertical: "physiotherapy",
      address: "218 Queen St E",
      city: "Toronto",
      region,
      timezone: tz,
      googlePlaceId: "ChIJharbourviewphysio",
      reviewUrl,
      rating: 4.7,
      reviewCount: 28,
      joinedAt,
      gbpConnected: true,
      profile: {
        description:
          "Harbourview Physiotherapy offers evidence-based physiotherapy, sports injury rehab, and manual therapy in Toronto's east end.",
        primaryCategory: "Physical therapy clinic",
        secondaryCategories: ["Sports medicine clinic", "Rehabilitation center"],
        photoCount: 12,
        postCount: 3,
        qnaCount: 2,
        hoursSet: true,
        holidayHoursSet: false,
        servicesWithDescriptions: 4,
        servicesTotal: 6,
        responseRate: 0.62,
        completeness: 78,
      },
      suggestionInbox: [
        {
          id: "suggestion_demo_post",
          workspaceId,
          locationId,
          auditId: "audit_demo",
          findingId: "finding_demo_post",
          target: "local_post",
          kind: "local_post",
          title: "Publish a fresh treatment education post",
          rationale: "No local post has been published in 18 days. Prepare a fact-checked post before approval.",
          priorityScore: 92,
          risk: "low",
          status: "needs_generation",
          proposedValue: { action: "draft_local_post_from_verified_facts" },
          exactPreviewReady: false,
          evidenceIds: ["ev_demo_posts"],
          blockers: ["Generate and review the exact proposed content before approval."],
          nextStep: "Prepare exact preview",
          createdAt: daysAgo(1),
          updatedAt: daysAgo(0),
        },
        {
          id: "suggestion_demo_reply",
          workspaceId,
          locationId,
          auditId: "audit_demo",
          findingId: "finding_demo_reply",
          target: "owner_reply",
          kind: "owner_reply",
          title: "Prepare a reply to Dana R.'s new review",
          rationale: "The latest imported review has no owner reply. The draft must stay faithful to the review and confirmed business facts.",
          priorityScore: 86,
          risk: "medium",
          status: "needs_generation",
          proposedValue: { action: "draft_faithful_owner_replies" },
          exactPreviewReady: false,
          evidenceIds: ["ev_demo_reviews"],
          blockers: ["Generate and review the exact proposed content before approval."],
          nextStep: "Prepare reply",
          createdAt: daysAgo(1),
          updatedAt: daysAgo(0),
        },
        {
          id: "suggestion_demo_hours",
          workspaceId,
          locationId,
          auditId: "audit_demo",
          findingId: "finding_demo_hours",
          target: "special_hours",
          kind: "profile_edit",
          title: "Confirm upcoming holiday hours",
          rationale: "No special hours are configured. Confirm the actual schedule before an exact Google change is prepared.",
          priorityScore: 74,
          risk: "medium",
          status: "needs_facts",
          exactPreviewReady: false,
          evidenceIds: ["ev_demo_hours"],
          blockers: ["Confirm the underlying business facts before Foundly prepares exact copy or values."],
          nextStep: "Confirm business facts",
          createdAt: daysAgo(1),
          updatedAt: daysAgo(0),
        },
      ],
    },
    owner: {
      id: "usr_owner",
      email: "owner@harbourviewphysio.ca",
      name: "Alex Chen",
      role: "owner",
      workspaceId,
      twoFactorEnabled: true,
      avatarInitials: "AC",
    },
    invites: [],
    staff,
    customers,
    requests,
    reviews,
    drafts: [],
    tasks,
    mutationJobs: [],
    campaigns: [
      {
        id: "camp_winback", locationId, name: "We miss you — 90 day check-in",
        type: "winback", isAutomation: true, consentBasis: "marketing", channel: "email",
        body: "Hi {first_name}, it's been a while since your last visit to Harbourview. Book a check-in and keep moving well.",
        status: "active", audienceTotal: 302, audienceConsented: 214,
        excluded: [
          { reason: "Opted out of marketing", count: 61 },
          { reason: "No valid channel", count: 14 },
          { reason: "Suppressed / asked recently", count: 9 },
          { reason: "Hard bounce", count: 4 },
        ],
        stats: { sent: 214, opened: 96, clicked: 31 }, createdAt: daysAgo(20),
      },
      {
        id: "camp_reminder", locationId, name: "Review request follow-up",
        type: "reminder", isAutomation: true, consentBasis: "service", channel: "email",
        body: "Hi {first_name}, just a quick nudge — if you have 30 seconds, we'd love your feedback on your recent visit.",
        status: "active", audienceTotal: 210, audienceConsented: 187,
        excluded: [{ reason: "Opted out of service messages", count: 23 }],
        stats: { sent: 187, opened: 121, clicked: 44 }, createdAt: daysAgo(30),
      },
    ],
    subscription: {
      id: "sub_harbourview",
      workspaceId,
      tier: "growth",
      interval: "monthly",
      status: "trialing",
      trialEndsAt: daysAhead(9),
      currency: "CAD",
      usage: {
        aiDraftsUsed: 41, aiDraftsLimit: -1,
        smsCreditsUsed: 68, smsCreditsTotal: 250,
        requestsSent: 132, reviewsCaptured: 19,
      },
    },
    invoices: [
      { id: "inv_1", workspaceId, amount: 0, currency: "CAD", status: "paid", period: "Trial", issuedAt: daysAgo(5) },
    ],
    competitors,
    metrics,
    aeo: {
      locationId,
      date: daysAgo(2).slice(0, 10),
      namedFraction: { named: 6, total: 10 },
      queries: [
        { query: "best physio for sports injury in Toronto east end", named: true, position: 2, competitorsNamed: ["Riverside Physio & Rehab"], answerExcerpt: "For sports injury rehab in Toronto's east end, well-reviewed options include Harbourview Physiotherapy and Riverside Physio & Rehab…" },
        { query: "physiotherapy clinic with direct billing near me", named: true, position: 1, competitorsNamed: [], answerExcerpt: "Harbourview Physiotherapy offers direct billing and consistently strong reviews…" },
        { query: "concussion rehab specialist Toronto", named: false, position: null, competitorsNamed: ["Eastside Sports Clinic", "Lakeshore Wellness"], answerExcerpt: "For concussion and vestibular rehab, consider Eastside Sports Clinic or Lakeshore Wellness…" },
        { query: "pediatric physiotherapy Toronto", named: true, position: 3, competitorsNamed: ["Lakeshore Wellness", "Riverside Physio & Rehab"], answerExcerpt: "Clinics offering pediatric physiotherapy include Lakeshore Wellness, Riverside Physio & Rehab, and Harbourview Physiotherapy…" },
        { query: "dry needling near me Toronto", named: true, position: 2, competitorsNamed: ["Eastside Sports Clinic"], answerExcerpt: "Harbourview Physiotherapy and Eastside Sports Clinic both offer dry needling…" },
        { query: "physio open Saturday Toronto east", named: false, position: null, competitorsNamed: ["Riverside Physio & Rehab"], answerExcerpt: "Riverside Physio & Rehab lists Saturday hours…" },
      ],
    },
    rankScans: [
      {
        id: "rank_1", locationId, keyword: "physiotherapy near me", gridSize: 5,
        avgRank: 4.2, shareOfLocalPack: 0.44, ranAt: daysAgo(2),
        points: Array.from({ length: 25 }, (_, k) => {
          const row = Math.floor(k / 5), col = k % 5;
          const center = Math.abs(row - 2) + Math.abs(col - 2);
          const rank = center <= 1 ? 1 + Math.floor(r() * 2) : center <= 2 ? 3 + Math.floor(r() * 4) : 8 + Math.floor(r() * 8);
          return { row, col, rank: rank > 20 ? null : rank };
        }),
      },
    ],
    qrAssets: [
      { id: "qr_loc", locationId, scope: "location", label: "Front desk QR", slug: "harbourview", targetUrl: reviewUrl, scans: 214, pageOpens: 168, degraded: false },
      { id: "qr_stf_priya", locationId, scope: "staff", staffId: "stf_priya", label: "Priya's QR", slug: "harbourview-priya", targetUrl: reviewUrl, scans: 92, pageOpens: 71, degraded: false },
      { id: "qr_stf_dan", locationId, scope: "staff", staffId: "stf_dan", label: "Dan's QR", slug: "harbourview-dan", targetUrl: reviewUrl, scans: 58, pageOpens: 44, degraded: false },
    ],
    widgets: [
      { id: "wid_1", locationId, kind: "carousel", domain: "harbourviewphysio.ca", impressions: 1840, clicks: 96 },
    ],
    milestones: [
      { id: "ms_25", locationId, kind: "reviews_25", title: "25 reviews!", subtitle: "You crossed 25 Google reviews", achievedAt: daysAgo(12), shared: false },
      { id: "ms_streak", locationId, kind: "streak_10", title: "10-day streak", subtitle: "Priya kept a 10-day capture streak", achievedAt: daysAgo(3), shared: true },
    ],
    suppression: [
      { id: "sup_1", locationId, matchType: "email", value: "optout@example.com", reason: "Opted out", addedAt: daysAgo(15) },
    ],
    integrations: [
      { id: "int_google", locationId, provider: "google", label: "Google Business Profile", status: "connected", detail: "Reviews + performance connected", lastSyncAt: hoursAgo(6) },
      { id: "int_places", locationId, provider: "google_places", label: "Google Places", status: "connected", detail: "Public data for Growth Score", lastSyncAt: hoursAgo(6) },
      { id: "int_website", locationId, provider: "website", label: "Business website", status: "connected", detail: "Public website facts cross-checked", lastSyncAt: hoursAgo(6) },
      { id: "int_search_console", locationId, provider: "search_console", label: "Google Search Console", status: "disconnected", detail: "Connect Google with Search Console read access" },
      { id: "int_instagram", locationId, provider: "instagram", label: "Instagram professional account", status: "disconnected", detail: "Connect an authorized Business or Creator account" },
      { id: "int_resend", locationId, provider: "resend", label: "Email (Resend)", status: "connected", detail: "Sending domain verified", lastSyncAt: hoursAgo(1) },
      { id: "int_twilio", locationId, provider: "twilio", label: "SMS (Twilio · A2P 10DLC)", status: "pending", detail: "A2P registration pending — 1–5 day carrier approval", },
      { id: "int_stripe", locationId, provider: "stripe", label: "Billing (Stripe)", status: "connected", detail: "Trial · CAD", lastSyncAt: hoursAgo(12) },
    ],
    auditLog: [
      { id: "aud_1", workspaceId, actor: "Alex Chen", action: "review.replied", targetType: "review", targetId: "rev_0", at: hoursAgo(4) },
      { id: "aud_2", workspaceId, actor: "Priya Sharma", action: "customer.captured", targetType: "customer", targetId: "cus_30", at: hoursAgo(6) },
      { id: "aud_3", workspaceId, actor: "Alex Chen", action: "task.approved", targetType: "gbp_task", targetId: "task_reply", at: daysAgo(1) },
    ],
    featureFlags: [
      { key: "rank_grid", description: "Local rank-grid map", enabled: true, rollout: "beta" },
      { key: "aeo", description: "AI Visibility / AEO module", enabled: true, rollout: "beta" },
      { key: "campaigns_pro", description: "Campaigns Pro journeys", enabled: false, rollout: "internal" },
      { key: "whatsapp", description: "WhatsApp channel (manual click-to-chat)", enabled: true, rollout: "all" },
    ],
    notifications: [
      { id: "ntf_1", locationId, kind: "review", title: "New 5★ review detected", body: "Dana R. left a 5-star review — likely matched to a request you sent.", createdAt: hoursAgo(3), read: false },
      { id: "ntf_2", locationId, kind: "feedback", title: "Private feedback needs attention", body: "A 2★ private note came in — a customer felt rushed.", createdAt: hoursAgo(8), read: false },
      { id: "ntf_3", locationId, kind: "milestone", title: "Milestone: 25 reviews", body: "You crossed 25 Google reviews. Share the win!", createdAt: daysAgo(1), read: true },
    ],
    privateFeedback: [
      { id: "pf_1", locationId, customerName: "Marcus M.", rating: 2, text: "The wait was longer than expected and I felt a bit rushed during the assessment.", createdAt: hoursAgo(8), resolved: false },
      { id: "pf_2", locationId, customerName: "Nadia K.", rating: 3, text: "Care was good but the parking situation is confusing — a sign would help.", createdAt: daysAgo(2), resolved: true },
    ],
    reports: [
      { id: "rep_1", locationId, period: "Last 30 days", headline: "1,840 people found you — up 32%", narrative: "Your steady stream of new reviews is helping more people find you on Google. Nine new reviews were detected this month and your response rate climbed to 62%.", generatedAt: daysAgo(1) },
    ],
    agency: {
      id: "agc_northside",
      organizationId: "org_northside",
      name: "Northside Marketing",
      wholesaleRate: 59,
      retailAverage: 149,
      whiteLabel: {
        brandName: "Northside Reviews", primary: "#1E5AA8", primaryDark: "#16437C",
        accent: "#E8A33D", logoText: "Northside", contrastValid: true,
      },
      clients: [
          { locationId: "loc_harbourview", name: "Harbourview Physiotherapy", city: "Toronto", contactEmail: "harbourview@example.com", growthScore: 78, rating: 4.7, newReviews30d: 9, needsReply: 3, plan: "growth", lastReportSent: daysAgo(6), status: "healthy" },
          { locationId: "loc_maple", name: "Maple Dental Studio", city: "Mississauga", contactEmail: "maple@example.com", growthScore: 71, rating: 4.6, newReviews30d: 6, needsReply: 5, plan: "growth", lastReportSent: daysAgo(6), status: "attention" },
          { locationId: "loc_summit", name: "Summit HVAC & Heating", city: "Brampton", contactEmail: "summit@example.com", growthScore: 58, rating: 4.3, newReviews30d: 2, needsReply: 8, plan: "growth", lastReportSent: daysAgo(34), status: "at_risk" },
          { locationId: "loc_bright", name: "Brightside Chiropractic", city: "Toronto", contactEmail: "brightside@example.com", growthScore: 82, rating: 4.8, newReviews30d: 11, needsReply: 1, plan: "growth", lastReportSent: daysAgo(6), status: "healthy" },
      ],
    },
    platform: {
      tenants: [
        { id: "org_harbourview", name: "Harbourview Physiotherapy", vertical: "physiotherapy", plan: "growth", mrr: 99, locations: 1, status: "trialing", region: "CA" },
        { id: "org_maple", name: "Maple Dental Studio", vertical: "dental", plan: "growth", mrr: 99, locations: 1, status: "active", region: "CA" },
        { id: "org_summit", name: "Summit HVAC & Heating", vertical: "hvac", plan: "growth", mrr: 99, locations: 1, status: "past_due", region: "CA" },
        { id: "org_northside", name: "Northside Marketing (Agency)", vertical: "physiotherapy", plan: "agency", mrr: 897, locations: 12, status: "active", region: "CA" },
      ],
      deliveryIncidents: [
        { id: "di_1", tenant: "Summit HVAC & Heating", channel: "sms", type: "Carrier filtering spike", severity: "medium", count: 14, at: hoursAgo(2) },
        { id: "di_2", tenant: "Maple Dental Studio", channel: "email", type: "Soft bounces", severity: "low", count: 3, at: hoursAgo(9) },
      ],
      fraudFlags: [
        { id: "ff_1", tenant: "Summit HVAC & Heating", kind: "same_device", detail: "3 submissions from one device fingerprint in 20 min", severity: "medium", at: hoursAgo(5) },
        { id: "ff_2", tenant: "Maple Dental Studio", kind: "staff_self_review", detail: "Submitting device matches a staff device", severity: "high", at: daysAgo(1) },
      ],
      durability: [
        { id: "dur_1", tenant: "Harbourview Physiotherapy", posted: 24, survived30d: 23, survived60d: 22, vanished: 2, filteredRate: 0.083 },
        { id: "dur_2", tenant: "Maple Dental Studio", posted: 41, survived30d: 39, survived60d: 37, vanished: 4, filteredRate: 0.098 },
        { id: "dur_3", tenant: "Summit HVAC & Heating", posted: 18, survived30d: 14, survived60d: 12, vanished: 6, filteredRate: 0.333 },
      ],
      kpis: {
        totalTenants: 4,
        activeLocations: 15,
        mrr: 1274,
        trialConversion: 0.12,
        logoChurn: 0.038,
        nrr: 1.06,
        weeklyDetectedReviews: 34,
      },
    },
  };

  void now;
  return data;
}
