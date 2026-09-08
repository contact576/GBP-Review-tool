import { describe, expect, it } from "vitest";
import { getIndustry } from "@/lib/industries";
import {
  ATTRIBUTE_CHIP_LIMIT,
  allAllowedChips,
  positiveChipsForService,
  serviceSpecificChips,
} from "@/lib/industries/service-attributes";

describe("service-aware experience chips", () => {
  it("puts chips that describe the chosen service first", () => {
    const dental = getIndustry("dental");
    const chips = positiveChipsForService("Teeth whitening", dental.attributes);
    expect(chips[0]).toBe("Gentle and careful");
    expect(chips).toContain("Explained every step");
    // The industry's own chips still follow.
    expect(chips.some((chip) => dental.attributes.includes(chip))).toBe(true);
  });

  it("falls back to the industry list plus universals when nothing matches", () => {
    const salon = getIndustry("salon");
    const chips = positiveChipsForService("Zorblat", salon.attributes);
    expect(chips.slice(0, salon.attributes.length)).toEqual(
      salon.attributes.slice(0, ATTRIBUTE_CHIP_LIMIT),
    );
    expect(serviceSpecificChips("Zorblat")).toEqual([]);
  });

  it("caps and dedupes the list", () => {
    const restaurant = getIndustry("restaurant");
    const chips = positiveChipsForService("Weekend brunch", restaurant.attributes);
    expect(chips.length).toBeLessThanOrEqual(ATTRIBUTE_CHIP_LIMIT);
    // "Great food" exists in both the brunch rule and the restaurant catalog.
    expect(chips.filter((chip) => chip.toLowerCase() === "great food")).toHaveLength(1);
  });

  it("lets a compound service pick up more than one rule, most specific first", () => {
    const chips = serviceSpecificChips("Emergency plumbing repair");
    expect(chips[0]).toBe("Came out fast");
    expect(chips).toContain("Diagnosed it quickly");
  });

  it("builds an allowlist covering every service the page can offer", () => {
    const hvac = getIndustry("hvac");
    const allowed = allAllowedChips(
      ["Furnace repair", "Duct cleaning"],
      hvac.attributes,
      hvac.neutralAttributes,
    );
    for (const service of ["Furnace repair", "Duct cleaning"]) {
      for (const chip of positiveChipsForService(service, hvac.attributes)) {
        expect(allowed).toContain(chip);
      }
    }
    for (const neutral of hvac.neutralAttributes) expect(allowed).toContain(neutral);
  });

  it("only adds universal fillers to a short list, and never a near-duplicate", () => {
    const short = positiveChipsForService(undefined, ["Easy booking", "Friendly staff"]);
    expect(short.length).toBeGreaterThan(2);
    expect(short).not.toContain("Easy to book");
    expect(short).not.toContain("Friendly and welcoming");
    const long = positiveChipsForService(undefined, ["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(long).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
  });

  it("never offers an outcome claim as a chip", () => {
    const banned = /cured|healed|guarantee|fixed forever|best in town|highly recommend/i;
    for (const service of ["root canal", "physio", "furnace repair", "tax return", "wedding"]) {
      for (const chip of serviceSpecificChips(service)) expect(chip).not.toMatch(banned);
    }
  });
});
