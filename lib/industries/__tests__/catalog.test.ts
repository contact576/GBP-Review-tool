import { describe, expect, it } from "vitest";
import {
  INDUSTRIES,
  INDUSTRY_GROUPS,
  LEGACY_VERTICAL_MAP,
  getIndustry,
  industriesByGroup,
  industryForGoogleCategory,
  resolveWorkspaceIndustry,
} from "@/lib/industries";
import type { Industry } from "@/lib/industries";

/** 4-star register must stay measured — never delighted-superlative. */
const BANNED_SUPERLATIVES =
  /exceeded|flawless|perfect|best .* ever|amazing|incredible|outstanding/i;

const LEGACY_VERTICALS = [
  "physiotherapy",
  "chiropractic",
  "dental",
  "hvac",
  "renovation",
  "salon",
  "restaurant",
] as const;

/** Every user-facing string in an industry entry. */
function allStrings(industry: Industry): string[] {
  return [
    industry.key,
    industry.label,
    ...industry.googleCategories,
    ...industry.services,
    ...industry.attributes,
    ...industry.neutralAttributes,
    industry.terminology.customer,
    industry.terminology.visit,
    industry.terminology.staff,
    industry.promptContext,
    ...industry.phrases.experience5,
    ...industry.phrases.experience4,
    ...industry.phrases.closer5,
    ...industry.phrases.closer4,
  ];
}

describe("industry catalog", () => {
  it("contains exactly 36 industries", () => {
    expect(INDUSTRIES).toHaveLength(36);
  });

  it("has unique keys", () => {
    const keys = INDUSTRIES.map((industry) => industry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every industry has enough services, attributes, and neutral chips", () => {
    for (const industry of INDUSTRIES) {
      expect(industry.services.length, industry.key).toBeGreaterThanOrEqual(6);
      expect(industry.attributes.length, industry.key).toBeGreaterThanOrEqual(6);
      expect(
        industry.neutralAttributes.length,
        industry.key,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("every industry has non-empty, well-stocked phrase banks", () => {
    for (const industry of INDUSTRIES) {
      const { experience5, experience4, closer5, closer4 } = industry.phrases;
      expect(experience5.length, industry.key).toBeGreaterThanOrEqual(4);
      expect(experience4.length, industry.key).toBeGreaterThanOrEqual(3);
      expect(closer5.length, industry.key).toBeGreaterThanOrEqual(3);
      expect(closer4.length, industry.key).toBeGreaterThanOrEqual(2);
      for (const bank of [experience5, experience4, closer5, closer4]) {
        for (const phrase of bank) {
          expect(phrase.trim().length, industry.key).toBeGreaterThan(0);
        }
      }
    }
  });

  it("experience4 banks contain no banned superlatives", () => {
    for (const industry of INDUSTRIES) {
      for (const phrase of industry.phrases.experience4) {
        expect(phrase, `${industry.key}: "${phrase}"`).not.toMatch(
          BANNED_SUPERLATIVES,
        );
      }
    }
  });

  it("keeps every string at 70 characters or fewer, with no emoji", () => {
    for (const industry of INDUSTRIES) {
      for (const value of allStrings(industry)) {
        expect(
          value.length,
          `${industry.key}: "${value}"`,
        ).toBeLessThanOrEqual(70);
        expect(value, `${industry.key}: "${value}"`).not.toMatch(
          /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
        );
      }
    }
  });

  it("googleCategories are lowercase", () => {
    for (const industry of INDUSTRIES) {
      for (const fragment of industry.googleCategories) {
        expect(fragment, industry.key).toBe(fragment.toLowerCase());
      }
    }
  });

  it("every industry group appears in INDUSTRY_GROUPS", () => {
    const groupKeys = new Set(INDUSTRY_GROUPS.map((group) => group.key));
    for (const industry of INDUSTRIES) {
      expect(groupKeys.has(industry.group), industry.key).toBe(true);
    }
  });
});

describe("getIndustry", () => {
  it("returns exact matches from the catalog", () => {
    expect(getIndustry("restaurant").label).toBe("Restaurant");
    expect(getIndustry("roofing").group).toBe("trades");
  });

  it("falls back gracefully for unknown keys", () => {
    const fallback = getIndustry("unknown_key");
    expect(fallback.key).toBe("unknown_key");
    expect(fallback.label).toBe("Unknown Key");
    expect(fallback.services.length).toBeGreaterThanOrEqual(6);
    expect(fallback.attributes.length).toBeGreaterThanOrEqual(6);
    expect(fallback.phrases.experience5.length).toBeGreaterThan(0);
  });
});

describe("industryForGoogleCategory", () => {
  it('resolves "Thai restaurant" to restaurant', () => {
    expect(industryForGoogleCategory("Thai restaurant")?.key).toBe("restaurant");
  });

  it("matches case-insensitively", () => {
    expect(industryForGoogleCategory("ROOFING CONTRACTOR")?.key).toBe("roofing");
  });

  it("returns null when nothing matches", () => {
    expect(industryForGoogleCategory("planetarium")).toBeNull();
    expect(industryForGoogleCategory("")).toBeNull();
  });
});

describe("industriesByGroup", () => {
  it("buckets all 36 industries into known groups", () => {
    const grouped = industriesByGroup();
    let total = 0;
    for (const [group, industries] of grouped) {
      expect(INDUSTRY_GROUPS.some((g) => g.key === group)).toBe(true);
      expect(industries.length).toBeGreaterThan(0);
      total += industries.length;
    }
    expect(total).toBe(36);
  });
});

describe("resolveWorkspaceIndustry", () => {
  it("returns the plain catalog entry without custom overrides", () => {
    expect(resolveWorkspaceIndustry("dental")).toEqual(getIndustry("dental"));
  });

  it("falls back for undefined keys", () => {
    expect(resolveWorkspaceIndustry(undefined).key).toBe(
      "professional_services",
    );
  });

  it("merges custom services/attributes first, deduped, and overrides label", () => {
    const resolved = resolveWorkspaceIndustry("roofing", {
      label: "Peak Roofing Co",
      services: ["Solar shingles", "Leak repair"],
      attributes: ["Honest quote", "Great warranty"],
    });
    expect(resolved.key).toBe("roofing");
    expect(resolved.label).toBe("Peak Roofing Co");
    expect(resolved.services.slice(0, 2)).toEqual([
      "Solar shingles",
      "Leak repair",
    ]);
    expect(
      resolved.services.filter((s) => s.toLowerCase() === "leak repair"),
    ).toHaveLength(1);
    expect(resolved.attributes[0]).toBe("Honest quote");
    expect(
      resolved.attributes.filter((a) => a.toLowerCase() === "honest quote"),
    ).toHaveLength(1);
    expect(resolved.attributes).toContain("Cleaned up after");
  });
});

describe("LEGACY_VERTICAL_MAP", () => {
  it("covers all 7 legacy Vertical values with valid catalog keys", () => {
    const catalogKeys = new Set(INDUSTRIES.map((industry) => industry.key));
    for (const vertical of LEGACY_VERTICALS) {
      const mapped = LEGACY_VERTICAL_MAP[vertical];
      expect(mapped, vertical).toBeDefined();
      expect(catalogKeys.has(mapped ?? ""), vertical).toBe(true);
    }
  });
});
