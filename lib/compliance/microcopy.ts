/**
 * Honesty & compliance microcopy — frozen platform tokens.
 *
 * These strings are SYSTEM-CONTROLLED. White-label agencies may rebrand color,
 * logo, and name, but never these — the attribution-honesty and no-gating
 * stance must survive every theme. Import from here; never inline.
 */
export const MICROCOPY = Object.freeze({
  // Attribution honesty
  sinceJoined: "Since you joined",
  detectedMatch: "Detected — likely matched by name and time, not exact.",
  foundYouLabel: "People who found you",
  contactedYouLabel: "People who contacted you",
  newReviewsLabel: "New reviews",
  actionsNotCustomers: "We show customer actions — never invented customer counts.",

  // Review page / customer flow
  aiDraftDisclaimer: "AI-drafted starting point — edit it so it's your own words.",
  customerWordsOnly: "Write about your genuine experience in your own words.",
  aiReviewEditDisclaimer: "Optional clarity edit only - Foundly never adds services, names, keywords, or claims.",
  samePathEveryRating: "The public Google review option is available for every rating.",
  publicLinkAlways: "Prefer to post publicly? Leave a Google review:",
  privateFeedbackHeader: "Tell us what went wrong — the owner reads every word.",
  privateFeedbackReassure: "This goes privately to the owner. You can still post a public review below.",
  noIncentive: "Reviews are never rewarded or incentivized.",

  // Consent
  consentServiceLabel: "The customer agreed to receive messages about their visit.",
  consentMarketingLabel: "The customer agreed to receive occasional offers (optional).",
  caslNote: "Canada (CASL): express consent captured at point of service.",

  // Brand / viral
  poweredByFoundly: "Reviews powered by Foundly",

  // GBP guardrail
  nameStuffBlocked: "We never add ranking keywords to your business name; real-world corrections require confirmed evidence and explicit approval.",
} as const);

export type MicrocopyKey = keyof typeof MICROCOPY;
