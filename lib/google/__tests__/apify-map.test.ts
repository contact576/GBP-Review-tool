import { describe, expect, it } from "vitest";
import {
  apifyLocationResource,
  mapApifyReviews,
  mapAttributes,
  mapLocalPosts,
  mapLocationRecord,
  mapOpeningHours,
  mapQuestions,
  responseRate,
} from "../apify-map";
import { isGbpReview } from "../public-sync";
import type { ApifyReview } from "../apify";

describe("apify review mapping", () => {
  const base: ApifyReview = {
    reviewId: "Ci9DQUlRQUNvZENodHljRjlvT2pKUFpEVlhRbmx5",
    rating: 5,
    text: "Great visit",
    publishedAt: "2026-08-23T22:14:07.716Z",
    author: { name: "Shannon" },
  };

  it("keys reviews on Google's own id so a later GBP import collapses onto the same record", () => {
    const [review] = mapApifyReviews([base], "loc_1");
    expect(review?.id).toBe("rev_gbp_Ci9DQUlRQUNvZENodHljRjlvT2pKUFpEVlhRbmx5");
    // The durability + matching layers treat this exactly as an owned import.
    expect(isGbpReview(review?.id ?? "")).toBe(true);
  });

  it("drops a review with no id rather than giving it a positional one", () => {
    // A positional id renames the same review between syncs, which the
    // durability layer would read as one review vanishing and another arriving.
    expect(mapApifyReviews([{ ...base, reviewId: undefined }], "loc_1")).toHaveLength(0);
    expect(mapApifyReviews([{ ...base, reviewId: "  " }], "loc_1")).toHaveLength(0);
  });

  it("drops a review with no usable rating or publish date instead of defaulting one", () => {
    expect(mapApifyReviews([{ ...base, rating: undefined }], "loc_1")).toHaveLength(0);
    expect(mapApifyReviews([{ ...base, rating: 0 }], "loc_1")).toHaveLength(0);
    expect(mapApifyReviews([{ ...base, publishedAt: undefined }], "loc_1")).toHaveLength(0);
  });

  it("marks a review replied only when the owner response actually has text", () => {
    expect(mapApifyReviews([base], "loc_1")[0]?.needsReply).toBe(true);
    expect(
      mapApifyReviews([{ ...base, ownerResponse: { text: "Thanks!" } }], "loc_1")[0]?.needsReply,
    ).toBe(false);
    expect(
      mapApifyReviews([{ ...base, ownerResponse: { text: "   " } }], "loc_1")[0]?.needsReply,
    ).toBe(true);
  });

  it("keeps an empty review text as empty rather than inventing copy", () => {
    expect(mapApifyReviews([{ ...base, text: null }], "loc_1")[0]?.text).toBe("");
  });

  it("computes response rate from the imported reviews, and 0 when there are none", () => {
    const reviews = mapApifyReviews(
      [base, { ...base, reviewId: "second", ownerResponse: { text: "Thanks!" } }],
      "loc_1",
    );
    expect(responseRate(reviews)).toBe(0.5);
    expect(responseRate([])).toBe(0);
  });
});

describe("opening hours", () => {
  it("parses ordinary display hours into periods", () => {
    const hours = mapOpeningHours([{ day: "Monday", hours: "9 AM to 11 PM" }]);
    expect(hours?.periods).toEqual([
      {
        openDay: "MONDAY",
        closeDay: "MONDAY",
        openTime: { hours: 9, minutes: 0 },
        closeTime: { hours: 23, minutes: 0 },
      },
    ]);
  });

  it("handles minutes, noon and midnight correctly", () => {
    expect(mapOpeningHours([{ day: "Friday", hours: "12 AM to 12:30 PM" }])?.periods[0]).toEqual({
      openDay: "FRIDAY",
      closeDay: "FRIDAY",
      openTime: { hours: 0, minutes: 0 },
      closeTime: { hours: 12, minutes: 30 },
    });
  });

  it("treats a closed day as no period, not as midnight-to-midnight", () => {
    expect(mapOpeningHours([{ day: "Sunday", hours: "Closed" }])).toBeUndefined();
  });

  it("returns undefined rather than guessing when nothing parses", () => {
    // "hours are set" must never be claimed off a string we did not understand.
    expect(mapOpeningHours([{ day: "Monday", hours: "Hours might differ" }])).toBeUndefined();
    expect(mapOpeningHours([])).toBeUndefined();
    expect(mapOpeningHours(undefined)).toBeUndefined();
  });
});

describe("attributes and content", () => {
  it("maps set attributes including the ones Google reports as false", () => {
    const attributes = mapAttributes({
      Accessibility: [{ "Wheelchair accessible entrance": true, "Assistive hearing loop": false }],
    });
    expect(attributes).toHaveLength(2);
    expect(attributes[0]).toMatchObject({
      name: "attributes/accessibility_wheelchair_accessible_entrance",
      displayName: "Wheelchair accessible entrance",
      valueType: "BOOL",
      values: [true],
    });
    expect(attributes[1]?.values).toEqual([false]);
  });

  it("maps questions with their answers", () => {
    const questions = mapQuestions([
      {
        question: "Is parking available?",
        askDate: "2026-01-02",
        askedBy: { name: "Dennis" },
        answers: [{ answer: "Yes, paid lot", answerDate: "2026-01-03" }, { answer: "  " }],
      },
    ]);
    expect(questions[0]?.text).toBe("Is parking available?");
    expect(questions[0]?.topAnswers).toHaveLength(1);
  });

  it("skips a blank question", () => {
    expect(mapQuestions([{ question: "   " }])).toHaveLength(0);
  });

  it("maps owner posts and keeps the call to action only when there is a link", () => {
    const posts = mapLocalPosts([
      { text: "Summer hours are live", postDate: "2026-06-01" },
      { text: "Book now", postDate: "2026-06-02", buttonLink: "https://x.test", buttonText: "BOOK" },
      { text: "   " },
    ]);
    expect(posts).toHaveLength(2);
    expect(posts[0]?.callToAction).toBeUndefined();
    expect(posts[1]?.callToAction).toEqual({ actionType: "BOOK", url: "https://x.test" });
  });
});

describe("location record", () => {
  const place = {
    title: "Ripley's Aquarium of Canada",
    placeId: "ChIJWwS21dU0K4gRPSGMKRkar40",
    website: "https://www.ripleys.com",
    phone: "+1 647-351-3474",
    street: "288 Bremner Blvd",
    city: "Toronto",
    state: "ON",
    postalCode: "M5V 3L9",
    countryCode: "ca",
    categoryName: "Aquarium",
    categories: ["Aquarium", "Tourist attraction"],
    ownerDescription: "Immerse yourself in a world of 20,000 aquatic animals.",
    description: "Expansive, modern aquarium.",
    location: { lat: 43.6424, lng: -79.3860 },
  };

  it("produces a location resource that cannot be written to", () => {
    const record = mapLocationRecord(place);
    // Scraping grants no write access, so a mutation must fail loudly rather
    // than resolve to a real accounts/*/locations/* target.
    expect(record.name).toBe(apifyLocationResource(place.placeId));
    expect(record.name.startsWith("accounts/")).toBe(false);
  });

  it("uses the owner's description, never Google's editorial summary", () => {
    expect(mapLocationRecord(place).profile?.description).toBe(place.ownerDescription);
    expect(mapLocationRecord({ ...place, ownerDescription: undefined }).profile).toBeUndefined();
  });

  it("splits primary and additional categories without duplicating the primary", () => {
    const categories = mapLocationRecord(place).categories;
    expect(categories?.primaryCategory?.displayName).toBe("Aquarium");
    expect(categories?.additionalCategories?.map((c) => c.displayName)).toEqual([
      "Tourist attraction",
    ]);
  });

  it("leaves Voice of Merchant unknown rather than false", () => {
    // It is an owner-only signal; absent is not the same as failing it.
    expect(mapLocationRecord(place).metadata?.hasVoiceOfMerchant).toBeUndefined();
  });

  it("carries the public review link", () => {
    expect(mapLocationRecord(place).metadata?.newReviewUri).toBe(
      `https://search.google.com/local/writereview?placeid=${place.placeId}`,
    );
  });

  it("omits coordinates when Google did not publish them", () => {
    expect(mapLocationRecord({ ...place, location: undefined }).latlng).toBeUndefined();
  });
});
