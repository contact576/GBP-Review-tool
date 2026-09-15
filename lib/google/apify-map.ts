import type {
  GbpAttributeValue,
  GbpLocalPost,
  GbpLocationRecord,
  GbpQuestion,
  Review,
} from "@/lib/data/types";
import { PRE_RECONCILE_DURABILITY } from "@/lib/reviews/durability";
import { GBP_REVIEW_ID_PREFIX } from "./public-sync";
import type { ApifyPlace, ApifyReview } from "./apify";

/**
 * Pure transform: Apify's public Google Maps payload → the GBP shapes the rest
 * of the app already understands. Side-effect free so it can be unit-tested
 * without a network or a database.
 *
 * Honesty rules baked in here:
 *  - Nothing is invented to fill a gap. A field Google didn't publish comes back
 *    `undefined`, and the caller records the source as unavailable rather than
 *    writing a plausible default.
 *  - Reviews keep GOOGLE'S OWN review id, so a scraped review and the same
 *    review re-imported later through the approved GBP API collapse onto one
 *    record — durability history and match attribution survive the switch.
 *  - `locationResource` is a deliberately invalid sentinel. Scraping grants no
 *    write access, so anything that tries to mutate this profile must fail
 *    loudly instead of targeting a real Google resource.
 */

/** Never a valid GBP location resource name — a write against it cannot succeed. */
export function apifyLocationResource(placeId: string): string {
  return `apify://places/${placeId}`;
}

const DAY_NAMES: Record<string, string> = {
  monday: "MONDAY",
  tuesday: "TUESDAY",
  wednesday: "WEDNESDAY",
  thursday: "THURSDAY",
  friday: "FRIDAY",
  saturday: "SATURDAY",
  sunday: "SUNDAY",
};

/** "9 AM" / "9:30 AM" / "12 PM" → { hours, minutes } in 24h, or null. */
function parseClock(raw: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(raw.trim());
  if (!match?.[1] || !match[3]) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  if (!Number.isFinite(hours) || hours > 12 || !Number.isFinite(minutes)) return null;
  const meridiem = match[3].toLowerCase();
  if (meridiem === "pm" && hours !== 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return { hours, minutes };
}

interface GbpPeriod {
  openDay: string;
  closeDay: string;
  openTime: { hours: number; minutes: number };
  closeTime: { hours: number; minutes: number };
}

/**
 * Google Maps prints hours as display strings ("9 AM to 11 PM", "Closed",
 * "Open 24 hours"). Only rows we can parse with confidence become periods;
 * an unrecognised row is dropped rather than guessed at, so "hours are set"
 * is never claimed on the strength of a string we didn't understand.
 */
export function mapOpeningHours(
  openingHours: ApifyPlace["openingHours"],
): { periods: GbpPeriod[] } | undefined {
  const periods: GbpPeriod[] = [];
  for (const entry of openingHours ?? []) {
    const day = DAY_NAMES[(entry.day ?? "").trim().toLowerCase()];
    const hours = (entry.hours ?? "").trim();
    if (!day || !hours) continue;
    if (/^closed$/i.test(hours)) continue; // a closed day has no period, by design
    if (/open 24 hours/i.test(hours)) {
      periods.push({
        openDay: day,
        closeDay: day,
        openTime: { hours: 0, minutes: 0 },
        closeTime: { hours: 24, minutes: 0 },
      });
      continue;
    }
    // Google uses several dashes and the word "to" between the two clock times.
    const parts = hours.split(/\s*(?:to|–|—|-|–|—)\s*/i);
    if (parts.length !== 2) continue;
    const open = parseClock(parts[0] ?? "");
    const close = parseClock(parts[1] ?? "");
    if (!open || !close) continue;
    periods.push({
      openDay: day,
      // A close time at or before the open time means the day runs past midnight.
      closeDay: day,
      openTime: open,
      closeTime: close,
    });
  }
  return periods.length > 0 ? { periods } : undefined;
}

/**
 * Google's public "additionalInfo" groups → GBP attribute values.
 *
 * Only attributes the business has actually SET are published, so this fills
 * `attributes`. The catalogue of attributes it COULD set is owner-only, which
 * is why `availableAttributes` stays empty and completeness scoring degrades
 * to "what is set" rather than "how much of what's possible".
 */
export function mapAttributes(
  additionalInfo: ApifyPlace["additionalInfo"],
): GbpAttributeValue[] {
  const attributes: GbpAttributeValue[] = [];
  for (const [group, rows] of Object.entries(additionalInfo ?? {})) {
    for (const row of rows ?? []) {
      for (const [label, value] of Object.entries(row ?? {})) {
        if (typeof value !== "boolean") continue;
        attributes.push({
          name: `attributes/${slug(group)}_${slug(label)}`,
          displayName: label,
          valueType: "BOOL",
          values: [value],
        });
      }
    }
  }
  return attributes;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function mapQuestions(
  questionsAndAnswers: ApifyPlace["questionsAndAnswers"],
): GbpQuestion[] {
  return (questionsAndAnswers ?? [])
    .filter((entry) => Boolean(entry.question?.trim()))
    .map((entry, index) => ({
      name: `questions/${index}`,
      text: entry.question ?? "",
      authorName: entry.askedBy?.name,
      createTime: entry.askDate,
      totalAnswerCount: entry.answers?.length ?? 0,
      topAnswers: (entry.answers ?? [])
        .filter((answer) => Boolean(answer.answer?.trim()))
        .map((answer) => ({
          text: answer.answer ?? "",
          authorName: answer.answeredBy?.name,
          createTime: answer.answerDate,
        })),
    }));
}

/**
 * Owner posts only.
 *
 * `ownerUpdates` is what the business published; Google also exposes
 * `updatesFromCustomers`, which is customer-authored and must never be counted
 * as the owner's posting activity.
 */
export function mapLocalPosts(ownerUpdates: ApifyPlace["ownerUpdates"]): GbpLocalPost[] {
  return (ownerUpdates ?? [])
    .filter((update) => Boolean(update.text?.trim()) || Boolean(update.imageUrl))
    .map((update, index) => ({
      name: `localPosts/${index}`,
      summary: update.text ?? undefined,
      topicType: "STANDARD",
      state: "LIVE",
      createTime: update.postDate,
      callToAction: update.buttonLink
        ? { actionType: update.buttonText ?? "LEARN_MORE", url: update.buttonLink }
        : undefined,
    }));
}

export function mapLocationRecord(place: ApifyPlace): GbpLocationRecord {
  const placeId = place.placeId ?? "";
  const primary = place.categoryName?.trim();
  const additional = (place.categories ?? []).filter(
    (category) => category.trim() && category.trim() !== primary,
  );
  const addressLines = place.street?.trim() ? [place.street.trim()] : undefined;

  return {
    name: apifyLocationResource(placeId),
    title: place.title,
    websiteUri: place.website,
    phoneNumbers: place.phone ? { primaryPhone: place.phone } : undefined,
    storefrontAddress: {
      regionCode: place.countryCode?.toUpperCase(),
      postalCode: place.postalCode ?? undefined,
      administrativeArea: place.state ?? undefined,
      locality: place.city ?? undefined,
      addressLines,
    },
    categories: primary
      ? {
          primaryCategory: { name: primary, displayName: primary },
          additionalCategories: additional.map((category) => ({
            name: category,
            displayName: category,
          })),
        }
      : undefined,
    regularHours: mapOpeningHours(place.openingHours),
    // Google publishes the owner's description; the italic line above it is
    // Google's own editorial summary and is NOT the owner's copy, so it is
    // never promoted into `profile.description`.
    profile: place.ownerDescription?.trim()
      ? { description: place.ownerDescription.trim() }
      : undefined,
    latlng:
      typeof place.location?.lat === "number" && typeof place.location?.lng === "number"
        ? { latitude: place.location.lat, longitude: place.location.lng }
        : undefined,
    metadata: {
      placeId,
      mapsUri: place.url,
      newReviewUri: placeId
        ? `https://search.google.com/local/writereview?placeid=${placeId}`
        : undefined,
      // Voice of Merchant is an owner-only signal. Unknown is not false.
      hasVoiceOfMerchant: undefined,
    },
  };
}

/**
 * Reviews → the app's shape, keyed on Google's own review id.
 *
 * A review with no id is dropped rather than given a positional one: a
 * positional id renames the same review between syncs, and the durability
 * layer would read that as one review vanishing and another appearing.
 */
export function mapApifyReviews(
  reviews: ApifyReview[],
  locationId: string,
): Review[] {
  const mapped: Review[] = [];
  for (const review of reviews) {
    const reviewId = review.reviewId?.trim();
    const rating = review.rating;
    if (!reviewId) continue;
    if (rating !== 1 && rating !== 2 && rating !== 3 && rating !== 4 && rating !== 5) continue;
    const publishedAt = review.publishedAt?.trim();
    if (!publishedAt) continue;
    mapped.push({
      id: `${GBP_REVIEW_ID_PREFIX}${reviewId}`,
      locationId,
      author: review.author?.name?.trim() || "Google user",
      rating,
      text: review.text ?? "",
      publishedAt,
      source: "google",
      durability: PRE_RECONCILE_DURABILITY,
      needsReply: !review.ownerResponse?.text?.trim(),
    });
  }
  return mapped;
}

/** Share of imported reviews the owner has replied to, or 0 when there are none. */
export function responseRate(reviews: Review[]): number {
  if (reviews.length === 0) return 0;
  return reviews.filter((review) => !review.needsReply).length / reviews.length;
}
