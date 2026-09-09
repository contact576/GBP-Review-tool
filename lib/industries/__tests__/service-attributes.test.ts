import { describe, expect, it } from "vitest";
import { getIndustry } from "@/lib/industries";
import {
  ATTRIBUTE_CHIP_LIMIT,
  allAllowedChips,
  chipGroupsForServices,
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

describe("chipGroupsForServices", () => {
  const industry = ["Professional team", "Clear communication", "Delivered on time"];
  const neutral = ["First engagement", "Repeat client"];

  it("gives each picked service its own row with that service's vocabulary", () => {
    const groups = chipGroupsForServices(["Google Ads", "Meta Ads"], industry, neutral);
    expect(groups.map((group) => group.service)).toEqual(["Google Ads", "Meta Ads", null]);
    expect(groups[0]!.chips).toContain("Thorough keyword research");
    expect(groups[0]!.chips).toContain("Landing page looked great");
    expect(groups[1]!.chips).toContain("Scroll-stopping creatives");
    expect(groups[1]!.chips).toContain("Targeting made sense");
    // The general row carries the industry chips and the neutral ones.
    expect(groups[2]!.chips).toContain("Professional team");
    expect(groups[2]!.chips).toContain("First engagement");
  });

  it("never repeats a chip across rows", () => {
    const groups = chipGroupsForServices(["Google Ads", "Meta Ads", "SEO"], industry, neutral);
    const all = groups.flatMap((group) => group.chips.map((chip) => chip.toLowerCase()));
    expect(new Set(all).size).toBe(all.length);
    // "Clear reporting" is offered by Meta Ads; the shared "Clear monthly
    // reporting" from Google Ads is a different chip, so both may appear, but
    // the SEO row must not re-offer anything already shown.
    for (const chip of groups[2]!.chips) {
      expect(groups[0]!.chips).not.toContain(chip);
      expect(groups[1]!.chips).not.toContain(chip);
    }
  });

  it("collapses to one general row when no service was picked, matching the single-service list", () => {
    const groups = chipGroupsForServices([], industry, neutral);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.service).toBeNull();
    const expected = [...positiveChipsForService(undefined, industry), ...neutral];
    expect(groups[0]!.chips).toEqual(expected);
  });

  it("merges services that share a vocabulary into one labelled row", () => {
    const groups = chipGroupsForServices(["Injury rehab", "Manual therapy", "Exercise programs"], industry, neutral);
    expect(groups.map((group) => group.service)).toEqual(["Injury rehab & Manual therapy", "Exercise programs", null]);
    expect(groups[0]!.chips).toContain("Hands-on and attentive");
    expect(groups[1]!.chips).toContain("Patient and encouraging");
  });

  it("skips a service row when nothing describes that service", () => {
    const groups = chipGroupsForServices(["Zorbulation"], industry, neutral);
    expect(groups.map((group) => group.service)).toEqual([null]);
  });

  it("keeps every group chip inside the allowlist the draft API enforces", () => {
    const services = ["Google Ads", "Meta Ads", "SEO", "Web design"];
    const allowed = new Set(allAllowedChips(services, industry, neutral).map((chip) => chip.toLowerCase()));
    for (const group of chipGroupsForServices(services, industry, neutral)) {
      for (const chip of group.chips) expect(allowed.has(chip.toLowerCase())).toBe(true);
    }
  });

  it("offers experience chips, never outcome claims, for marketing services", () => {
    const banned = /doubled|roi|ranked #1|guarantee|leads went up|sales|revenue|results/i;
    for (const service of ["Google Ads", "Meta Ads", "SEO", "Web design", "Email marketing"]) {
      for (const chip of serviceSpecificChips(service)) expect(chip).not.toMatch(banned);
    }
  });
});
