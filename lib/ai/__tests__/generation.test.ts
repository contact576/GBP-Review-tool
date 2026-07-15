import { describe, expect, it } from "vitest";
import {
  fallbackReviewDrafts,
  fallbackReplyDrafts,
  fallbackScoreSample,
  normalizeStanding,
  starsForStanding,
  resolveReviewIndustry,
  type ReviewDraftInput,
  type ScoreStanding,
} from "@/lib/ai/fallbacks";
import { lintSentimentConsistency, runLints } from "@/lib/compliance/lints";
import { getIndustry, INDUSTRIES } from "@/lib/industries";

/** Superlatives that must never appear in a 4-star register. */
const BANNED_AT_4 = /exceeded expectations|flawless|perfect|\bbest\b.*\bever\b|incredible|10\s*\/\s*10/i;
/** Any strong-positive superlative (banned in weak/average score samples). */
const STRONG_POSITIVE =
  /exceeded|flawless|perfect|amazing|incredible|outstanding|\bbest\b.*\bever\b|highly recommend|10\s*\/\s*10|five stars/i;

const REPRESENTATIVE = [
  { key: "restaurant", business: "Cedar Grove Bistro" },
  { key: "physiotherapy", business: "Harbourview Physio" },
  { key: "renovation", business: "Oakline Renovations" },
  { key: "real_estate", business: "Juniper Realty Group" },
  { key: "salon", business: "Velvet Room Salon" },
  { key: "auto_repair", business: "Redline Auto Works" },
] as const;

function inputFor(key: string, business: string, rating: number): ReviewDraftInput {
  const industry = getIndustry(key);
  return {
    business,
    category: industry.label,
    industryKey: key,
    rating,
    attributes: industry.attributes.slice(0, 2),
    service: industry.services[0],
    staffName: "Maya",
  };
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("template engine — fallbackReviewDrafts", () => {
  for (const { key, business } of REPRESENTATIVE) {
    for (const rating of [4, 5]) {
      it(`${key} ${rating}★: 3 lint-clean, grounded variants`, () => {
        const input = inputFor(key, business, rating);
        const variants = fallbackReviewDrafts(input);

        expect(variants).toHaveLength(3);
        const tones = new Set(variants.map((v) => v.tone));
        expect(tones.size).toBe(3);

        for (const v of variants) {
          // Full lint pass INCLUDING sentiment-vs-rating.
          const res = runLints(v.text, {
            kind: "review",
            businessName: input.business,
            rating,
            allowedFacts: [...input.attributes, input.service ?? "", input.staffName ?? ""],
          });
          expect(res.flags, `${key} ${rating}★ [${v.tone}]: ${v.text}`).toEqual([]);

          // 4★ register: no 5★-only superlatives anywhere.
          if (rating === 4) {
            expect(v.text, `${key} 4★ [${v.tone}]`).not.toMatch(BANNED_AT_4);
          }

          // Business name exactly once.
          expect(countOccurrences(v.text, business), `${key} ${rating}★ [${v.tone}]: ${v.text}`).toBe(1);

          // At least one selected attribute woven in (lowercased).
          const lower = v.text.toLowerCase();
          const hasAttr = input.attributes.some((a) => lower.includes(a.toLowerCase()));
          expect(hasAttr, `${key} ${rating}★ [${v.tone}] missing attributes: ${v.text}`).toBe(true);

          // Service woven in when provided.
          expect(lower, `${key} ${rating}★ [${v.tone}] missing service`).toContain(
            (input.service ?? "").toLowerCase(),
          );
        }

        // The three structures must be genuinely different.
        const texts = variants.map((v) => v.text);
        expect(new Set(texts).size).toBe(3);
      });
    }
  }

  it("mentions the staff first name in at least one variant", () => {
    const input = inputFor("auto_repair", "Redline Auto Works", 5);
    const variants = fallbackReviewDrafts(input);
    expect(variants.some((v) => v.text.includes("Maya"))).toBe(true);
    // The industry terminology frames the staff member.
    expect(variants.some((v) => v.text.includes("technician"))).toBe(true);
  });

  it("rating changes the register: 4★ and 5★ drafts differ", () => {
    const five = fallbackReviewDrafts(inputFor("restaurant", "Cedar Grove Bistro", 5));
    const four = fallbackReviewDrafts(inputFor("restaurant", "Cedar Grove Bistro", 4));
    for (let i = 0; i < 3; i++) {
      expect(five[i]!.text).not.toBe(four[i]!.text);
    }
  });

  it("two different businesses with identical inputs produce meaningfully different text", () => {
    const a = fallbackReviewDrafts(inputFor("salon", "Velvet Room Salon", 5));
    const b = fallbackReviewDrafts(inputFor("salon", "Golden Hour Studio", 5));
    const strip = (variants: { text: string }[], name: string) =>
      variants.map((v) => v.text.split(name).join("{biz}")).join("\n");
    expect(strip(a, "Velvet Room Salon")).not.toBe(strip(b, "Golden Hour Studio"));
  });

  it("ratings ≤3 produce neutral factual sentences, never promotional copy", () => {
    const variants = fallbackReviewDrafts(inputFor("restaurant", "Cedar Grove Bistro", 3));
    expect(variants).toHaveLength(3);
    for (const v of variants) {
      expect(v.text).not.toMatch(STRONG_POSITIVE);
      const res = runLints(v.text, {
        kind: "review",
        businessName: "Cedar Grove Bistro",
        rating: 3,
      });
      expect(res.flags).toEqual([]);
    }
  });

  it("every catalog industry produces lint-clean 4★ and 5★ drafts", () => {
    for (const industry of INDUSTRIES) {
      for (const rating of [4, 5]) {
        const input: ReviewDraftInput = {
          business: "Juniper & Co",
          category: industry.label,
          industryKey: industry.key,
          rating,
          attributes: industry.attributes.slice(0, 2),
          service: industry.services[0],
          staffName: "Alex",
        };
        for (const v of fallbackReviewDrafts(input)) {
          const res = runLints(v.text, {
            kind: "review",
            businessName: input.business,
            rating,
            allowedFacts: [...input.attributes, input.service ?? "", "Alex"],
          });
          expect(res.flags, `${industry.key} ${rating}★ [${v.tone}]: ${v.text}`).toEqual([]);
        }
      }
    }
  });

  it("resolves industry from legacy category text when no key is given", () => {
    expect(resolveReviewIndustry(undefined, "restaurant").key).toBe("restaurant");
    expect(resolveReviewIndustry(undefined, "Physiotherapy clinic").key).toBe("physiotherapy");
    expect(resolveReviewIndustry(undefined, "totally unknown thing").key).toBe("professional_services");
    expect(resolveReviewIndustry("salon", "whatever").key).toBe("salon");
  });
});

describe("lintSentimentConsistency", () => {
  const HYPE = "This place exceeded expectations — perfect from start to finish, 10/10.";

  it("allows 5★ superlatives at rating 5", () => {
    expect(lintSentimentConsistency(HYPE, 5)).toBeNull();
  });

  it("flags 5★ superlatives at rating 4", () => {
    const flag = lintSentimentConsistency(HYPE, 4);
    expect(flag?.code).toBe("sentiment_mismatch");
    expect(lintSentimentConsistency("The result was flawless.", 4)?.code).toBe("sentiment_mismatch");
    expect(lintSentimentConsistency("Best meal I have ever had.", 4)?.code).toBe("sentiment_mismatch");
  });

  it("allows warm-positive language at rating 4", () => {
    expect(
      lintSentimentConsistency("Really great meal and friendly service — would recommend.", 4),
    ).toBeNull();
  });

  it("flags any strong positive at rating ≤3", () => {
    expect(lintSentimentConsistency("Amazing place, highly recommend!", 2)?.code).toBe("sentiment_mismatch");
    expect(lintSentimentConsistency("Outstanding service all around.", 3)?.code).toBe("sentiment_mismatch");
    expect(lintSentimentConsistency("Five stars from me.", 1)?.code).toBe("sentiment_mismatch");
  });

  it("passes neutral text at low ratings", () => {
    expect(lintSentimentConsistency("I had an appointment on a weekday morning.", 2)).toBeNull();
  });

  it("is wired into runLints for reviews with a rating", () => {
    const bad = runLints("Flawless — best experience ever.", { kind: "review", rating: 4 });
    expect(bad.ok).toBe(false);
    expect(bad.flags.some((f) => f.code === "sentiment_mismatch")).toBe(true);

    // No rating → no sentiment lint (back-compat).
    expect(runLints("Flawless — best experience ever.", { kind: "review" }).ok).toBe(true);
    // Non-review kinds are untouched.
    expect(runLints("Flawless — best experience ever.", { kind: "reply", rating: 4 }).ok).toBe(true);
  });
});

describe("fallbackScoreSample", () => {
  const CATEGORIES = ["Restaurant", "Physiotherapy", "Auto repair", "Salon & spa", "Other local business"];

  it("weak standing produces measured samples with no superlatives", () => {
    for (const category of CATEGORIES) {
      const text = fallbackScoreSample({ business: "Harbour Lane Co", category, standing: "weak" });
      expect(text, `${category}: ${text}`).not.toMatch(STRONG_POSITIVE);
      const res = runLints(text, { kind: "review", businessName: "Harbour Lane Co", rating: 4 });
      expect(res.flags, `${category}: ${text}`).toEqual([]);
      expect(text).toContain("Harbour Lane Co");
    }
  });

  it("average standing stays in the 4★ register", () => {
    for (const category of CATEGORIES) {
      const text = fallbackScoreSample({ business: "Harbour Lane Co", category, standing: "average" });
      expect(text, `${category}: ${text}`).not.toMatch(BANNED_AT_4);
      expect(runLints(text, { kind: "review", businessName: "Harbour Lane Co", rating: 4 }).ok).toBe(true);
    }
  });

  it("strong standing produces a confident, lint-clean 5★ sample", () => {
    for (const category of CATEGORIES) {
      const text = fallbackScoreSample({ business: "Harbour Lane Co", category, standing: "strong" });
      expect(runLints(text, { kind: "review", businessName: "Harbour Lane Co", rating: 5 }).ok).toBe(true);
      expect(text).toContain("Harbour Lane Co");
    }
  });

  it("bands differ from each other for the same business", () => {
    const bands: ScoreStanding[] = ["strong", "average", "weak"];
    const texts = bands.map((standing) =>
      fallbackScoreSample({ business: "Harbour Lane Co", category: "Restaurant", standing }),
    );
    expect(new Set(texts).size).toBe(3);
  });

  it("offers at least 3 distinct samples per band", () => {
    const names = ["Alpha One", "Beta Two", "Gamma Three", "Delta Four", "Epsilon Five", "Zeta Six", "Eta Seven"];
    for (const standing of ["strong", "average", "weak"] as const) {
      const texts = new Set(
        names.map((business) => {
          const t = fallbackScoreSample({ business, category: "Restaurant", standing });
          return t.split(business).join("{biz}");
        }),
      );
      expect(texts.size, standing).toBeGreaterThanOrEqual(3);
    }
  });

  it("derives standing from rating when not given", () => {
    expect(normalizeStanding({ rating: 4.8 })).toBe("strong");
    expect(normalizeStanding({ rating: 4.0 })).toBe("average");
    expect(normalizeStanding({ rating: 3.1 })).toBe("weak");
    expect(normalizeStanding({ standing: "weak", rating: 5 })).toBe("weak");
    expect(normalizeStanding({})).toBe("strong");
    expect(starsForStanding("strong")).toBe(5);
    expect(starsForStanding("average")).toBe(4);
    expect(starsForStanding("weak")).toBe(4);
  });
});

describe("fallbackReplyDrafts", () => {
  it("1-2★ replies apologize deeply and ask for direct contact", () => {
    for (const rating of [1, 2]) {
      const variants = fallbackReplyDrafts({ reviewText: "Bad.", rating, business: "Cedar Grove Bistro" });
      expect(variants).toHaveLength(3);
      for (const v of variants) {
        expect(v.text.toLowerCase()).toMatch(/sorry|apologi/);
        expect(v.text.toLowerCase()).toMatch(/contact us directly|reach out/);
      }
    }
  });

  it("3★ replies thank and invite a specific improvement", () => {
    const variants = fallbackReplyDrafts({ reviewText: "It was ok.", rating: 3, business: "Cedar Grove Bistro" });
    expect(variants).toHaveLength(3);
    for (const v of variants) {
      expect(v.text.toLowerCase()).toMatch(/thank|appreciate/);
      expect(v.text.toLowerCase()).toMatch(/improve|better/);
    }
    // 3★ differs from the 1-2★ register.
    const low = fallbackReplyDrafts({ reviewText: "It was ok.", rating: 2, business: "Cedar Grove Bistro" });
    expect(variants[0]!.text).not.toBe(low[0]!.text);
  });
});
