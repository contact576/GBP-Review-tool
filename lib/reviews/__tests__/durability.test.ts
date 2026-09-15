import { describe, it, expect } from "vitest";
import {
  diffSkipReason,
  isPlausibleFullImport,
  nextDurability,
  reconcileReviewImport,
  VANISH_GUARD,
} from "@/lib/reviews/durability";
import type { Review } from "@/lib/data/types";

const NOW = "2026-07-25T12:00:00.000Z";

function review(id: string, overrides: Partial<Review> = {}): Review {
  return {
    id,
    locationId: "loc_1",
    author: "Sam Patel",
    rating: 5,
    text: "Great service",
    publishedAt: "2026-07-01T00:00:00.000Z",
    source: "google",
    durability: "stable",
    needsReply: false,
    ...overrides,
  };
}

function many(count: number, prefix = "rev_gbp_"): Review[] {
  return Array.from({ length: count }, (_, index) => review(`${prefix}${index}`));
}

describe("vanish detection", () => {
  it("marks a previously imported review as vanished when it disappears", () => {
    const plan = reconcileReviewImport({
      existing: [review("rev_gbp_a"), review("rev_gbp_b")],
      imported: [review("rev_gbp_a")],
      nowIso: NOW,
    });

    expect(plan.diffed).toBe(true);
    expect(plan.vanished.map((r) => r.id)).toEqual(["rev_gbp_b"]);
    expect(plan.vanished[0]?.durability).toBe("vanished");
    expect(plan.vanished[0]?.vanishedAt).toBe(NOW);
  });

  it("NEVER deletes a vanished review — it stays in the merged set", () => {
    const plan = reconcileReviewImport({
      existing: [review("rev_gbp_a"), review("rev_gbp_b")],
      imported: [review("rev_gbp_a")],
      nowIso: NOW,
    });

    expect(plan.removed).toEqual([]);
    expect(plan.merged.map((r) => r.id).sort()).toEqual(["rev_gbp_a", "rev_gbp_b"]);
  });

  it("keeps the FIRST vanishedAt so the 30-day window is not reset each sync", () => {
    const alreadyGone = review("rev_gbp_b", {
      durability: "vanished",
      vanishedAt: "2026-07-01T00:00:00.000Z",
    });
    const plan = reconcileReviewImport({
      existing: [review("rev_gbp_a"), alreadyGone],
      imported: [review("rev_gbp_a")],
      nowIso: NOW,
    });

    // Nothing changed, so nothing is rewritten.
    expect(plan.vanished).toEqual([]);
    expect(plan.retained.map((r) => r.id)).toEqual(["rev_gbp_b"]);
    expect(plan.merged.find((r) => r.id === "rev_gbp_b")?.vanishedAt).toBe(
      "2026-07-01T00:00:00.000Z",
    );
  });

  it("flags a review that vanished and came back as at_risk", () => {
    const returned = review("rev_gbp_b", {
      durability: "vanished",
      vanishedAt: "2026-07-10T00:00:00.000Z",
    });
    const plan = reconcileReviewImport({
      existing: [returned],
      imported: [review("rev_gbp_b")],
      nowIso: NOW,
    });

    const merged = plan.merged[0];
    expect(merged?.durability).toBe("at_risk");
    // The disappearance is history worth keeping, not state to erase.
    expect(merged?.vanishedAt).toBe("2026-07-10T00:00:00.000Z");
    expect(plan.updates.map((r) => r.id)).toEqual(["rev_gbp_b"]);
  });

  it("keeps at_risk sticky on later imports — the disappearance still happened", () => {
    const flapped = review("rev_gbp_b", {
      durability: "at_risk",
      vanishedAt: "2026-07-10T00:00:00.000Z",
    });
    const plan = reconcileReviewImport({
      existing: [flapped],
      imported: [review("rev_gbp_b")],
      nowIso: NOW,
    });
    expect(plan.merged[0]?.durability).toBe("at_risk");
  });

  it("inserts brand-new reviews as stable and never invents a risk flag", () => {
    const plan = reconcileReviewImport({
      existing: [],
      imported: [review("rev_gbp_new", { publishedAt: NOW })],
      nowIso: NOW,
    });
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]?.durability).toBe("stable");
    expect(plan.vanished).toEqual([]);
  });

  it("carries accumulated durability and attribution across an import", () => {
    const stored = review("rev_gbp_a", {
      durability: "at_risk",
      vanishedAt: "2026-06-01T00:00:00.000Z",
      matchedRequestId: "req_1",
      matchConfidence: 0.8,
    });
    const plan = reconcileReviewImport({
      existing: [stored],
      imported: [review("rev_gbp_a", { text: "Edited by the author" })],
      nowIso: NOW,
    });
    const merged = plan.merged[0];
    expect(merged?.text).toBe("Edited by the author"); // Google owns content
    expect(merged?.matchedRequestId).toBe("req_1"); // we own attribution
    expect(merged?.matchConfidence).toBe(0.8);
    expect(merged?.durability).toBe("at_risk");
  });

  it("writes nothing when the import is identical to what is stored", () => {
    const stored = [review("rev_gbp_a"), review("rev_gbp_b")];
    const plan = reconcileReviewImport({
      existing: stored,
      imported: [review("rev_gbp_a"), review("rev_gbp_b")],
      nowIso: NOW,
    });
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.vanished).toEqual([]);
  });
});

describe("failed / empty import safety guard", () => {
  it("does NOT mass-mark vanished when the fetch failed", () => {
    const stored = many(20);
    const plan = reconcileReviewImport({
      existing: stored,
      imported: [],
      nowIso: NOW,
      importOk: false,
    });

    expect(plan.diffed).toBe(false);
    expect(plan.skipReason).toBe("import_failed");
    expect(plan.vanished).toEqual([]);
    expect(plan.removed).toEqual([]);
    expect(plan.retained).toHaveLength(20);
    expect(plan.merged).toHaveLength(20);
    expect(plan.merged.every((r) => r.durability === "stable")).toBe(true);
  });

  it("does NOT mass-mark vanished on an empty payload when we held reviews", () => {
    const plan = reconcileReviewImport({
      existing: many(12),
      imported: [],
      nowIso: NOW,
      importOk: true,
    });

    expect(plan.skipReason).toBe("empty_import");
    expect(plan.vanished).toEqual([]);
    expect(plan.merged).toHaveLength(12);
  });

  it("does NOT mark vanished when the payload collapses implausibly", () => {
    const plan = reconcileReviewImport({
      existing: many(40),
      imported: many(3),
      nowIso: NOW,
      importOk: true,
    });

    expect(plan.skipReason).toBe("implausible_shrink");
    expect(plan.vanished).toEqual([]);
    // The three reviews that DID come back are still refreshed.
    expect(plan.merged).toHaveLength(40);
  });

  it("still diffs an ordinary, believable loss of a few reviews", () => {
    const plan = reconcileReviewImport({
      existing: many(40),
      imported: many(37),
      nowIso: NOW,
      importOk: true,
    });

    expect(plan.diffed).toBe(true);
    expect(plan.vanished).toHaveLength(3);
  });

  it("diffs a small workspace that genuinely lost its only reviews...", () => {
    // Below MIN_ABSOLUTE_DROP the ratio guard does not apply, so a 4→1 loss is
    // reported honestly rather than being swallowed by the safety net.
    const plan = reconcileReviewImport({
      existing: many(4),
      imported: many(1),
      nowIso: NOW,
      importOk: true,
    });
    expect(plan.diffed).toBe(true);
    expect(plan.vanished).toHaveLength(3);
  });

  it("...but a zero-review payload is never trusted, however small", () => {
    const plan = reconcileReviewImport({
      existing: many(1),
      imported: [],
      nowIso: NOW,
      importOk: true,
    });
    expect(plan.skipReason).toBe("empty_import");
    expect(plan.vanished).toEqual([]);
  });

  it("preserves an existing vanished flag through a guarded import", () => {
    const stored = review("rev_gbp_b", { durability: "vanished", vanishedAt: NOW });
    const plan = reconcileReviewImport({
      existing: [stored],
      imported: [],
      nowIso: "2026-08-01T00:00:00.000Z",
      importOk: false,
    });
    expect(plan.merged[0]?.durability).toBe("vanished");
    expect(plan.merged[0]?.vanishedAt).toBe(NOW);
  });

  it("does not promote vanished → at_risk on an untrusted import", () => {
    const stored = review("rev_gbp_b", { durability: "vanished", vanishedAt: NOW });
    const plan = reconcileReviewImport({
      existing: [stored],
      imported: [review("rev_gbp_b")],
      nowIso: NOW,
      importOk: false,
    });
    // The review is back in a payload we do not trust; "it came back" is a
    // claim we have not actually earned, so the prior state stands.
    expect(plan.merged[0]?.durability).toBe("vanished");
  });

  it("exposes the guard decision directly", () => {
    const base = { importOk: true, mode: "authoritative" as const };
    expect(diffSkipReason({ ...base, existingCount: 10, importedCount: 9 })).toBeUndefined();
    expect(diffSkipReason({ ...base, existingCount: 0, importedCount: 0 })).toBeUndefined();
    expect(diffSkipReason({ ...base, importOk: false, existingCount: 1, importedCount: 1 })).toBe(
      "import_failed",
    );
    expect(diffSkipReason({ ...base, existingCount: 3, importedCount: 0 })).toBe("empty_import");
    expect(diffSkipReason({ ...base, mode: "sample", existingCount: 3, importedCount: 3 })).toBe(
      "non_diffable_source",
    );
  });
});

describe("public sample mode", () => {
  it("never marks a rotating sample review as vanished", () => {
    const plan = reconcileReviewImport({
      existing: [review("rev_gpub_1"), review("rev_gpub_2")],
      imported: [review("rev_gpub_1")],
      nowIso: NOW,
      mode: "sample",
    });

    expect(plan.diffed).toBe(false);
    expect(plan.skipReason).toBe("non_diffable_source");
    expect(plan.vanished).toEqual([]);
    // It rotated out of Google's 5-review window; that is all we can say.
    expect(plan.removed.map((r) => r.id)).toEqual(["rev_gpub_2"]);
  });

  it("does not wipe the stored sample when the sample comes back empty", () => {
    const plan = reconcileReviewImport({
      existing: [review("rev_gpub_1")],
      imported: [],
      nowIso: NOW,
      mode: "sample",
    });
    expect(plan.removed).toEqual([]);
    expect(plan.merged).toHaveLength(1);
  });

  it("carries a known review's durability across a sample refresh", () => {
    const stored = review("rev_gpub_1", { durability: "at_risk", vanishedAt: NOW });
    const plan = reconcileReviewImport({
      existing: [stored],
      imported: [review("rev_gpub_1")],
      nowIso: NOW,
      mode: "sample",
    });
    expect(plan.merged[0]?.durability).toBe("at_risk");
  });

  /**
   * The public Places payload carries no owner replies, so every review in it
   * arrives flagged as answered. That must never overwrite what a GBP import
   * actually read, or an unanswered review silently disappears from the
   * owner's reply queue on the next public sync.
   */
  it("does not let a sample import mark an unanswered review as answered", () => {
    const stored = review("rev_gpub_1", { needsReply: true });
    const plan = reconcileReviewImport({
      existing: [stored],
      imported: [review("rev_gpub_1", { needsReply: false })],
      nowIso: NOW,
      mode: "sample",
    });
    expect(plan.merged[0]?.needsReply).toBe(true);
    // Nothing changed, so nothing is written.
    expect(plan.updates).toEqual([]);
  });

  it("leaves a genuinely answered review answered across a sample refresh", () => {
    const plan = reconcileReviewImport({
      existing: [review("rev_gpub_1", { needsReply: false })],
      imported: [review("rev_gpub_1", { needsReply: false })],
      nowIso: NOW,
      mode: "sample",
    });
    expect(plan.merged[0]?.needsReply).toBe(false);
  });

  it("still records reply state for a review the sample is showing for the first time", () => {
    const plan = reconcileReviewImport({
      existing: [],
      imported: [review("rev_gpub_new", { needsReply: true })],
      nowIso: NOW,
      mode: "sample",
    });
    expect(plan.inserts[0]?.needsReply).toBe(true);
  });

  it("lets an authoritative import correct reply state in both directions", () => {
    const answered = reconcileReviewImport({
      existing: [review("rev_1", { needsReply: true })],
      imported: [review("rev_1", { needsReply: false })],
      nowIso: NOW,
      mode: "authoritative",
    });
    expect(answered.merged[0]?.needsReply).toBe(false);

    const unanswered = reconcileReviewImport({
      existing: [review("rev_1", { needsReply: false })],
      imported: [review("rev_1", { needsReply: true })],
      nowIso: NOW,
      mode: "authoritative",
    });
    expect(unanswered.merged[0]?.needsReply).toBe(true);
  });
});

describe("isPlausibleFullImport", () => {
  it("accepts an import consistent with Google's own total", () => {
    expect(isPlausibleFullImport(48, 50)).toBe(true);
    expect(isPlausibleFullImport(50, 50)).toBe(true);
    expect(isPlausibleFullImport(3, undefined)).toBe(true);
    expect(isPlausibleFullImport(0, 0)).toBe(true);
  });

  it("rejects a payload drastically shorter than Google's total", () => {
    expect(isPlausibleFullImport(10, 120)).toBe(false);
    expect(isPlausibleFullImport(0, 30)).toBe(false);
  });

  it("tolerates small shortfalls below the absolute-drop floor", () => {
    expect(isPlausibleFullImport(4, 4 + VANISH_GUARD.MIN_ABSOLUTE_DROP - 1)).toBe(true);
  });
});

describe("nextDurability", () => {
  it("is deterministic across every combination (never random)", () => {
    const prior = review("rev_gbp_a");
    expect(nextDurability(undefined, true, true)).toBe("stable");
    expect(nextDurability(undefined, false, true)).toBe("stable");
    expect(nextDurability(prior, true, true)).toBe("stable");
    expect(nextDurability(prior, false, true)).toBe("vanished");
    expect(nextDurability(prior, false, false)).toBe("stable");
    expect(
      nextDurability({ ...prior, durability: "vanished", vanishedAt: NOW }, true, true),
    ).toBe("at_risk");
  });
});
