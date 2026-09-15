import { describe, expect, it } from "vitest";
import { resolveServiceOptions } from "@/lib/industries";

describe("resolveServiceOptions", () => {
  const catalog = ["Dine-in", "Takeout", "Catering"];

  it("uses the catalog only when nothing real exists", () => {
    const resolved = resolveServiceOptions({ catalogServices: catalog });
    expect(resolved.services).toEqual(catalog);
    expect(resolved.source).toBe("catalog");
    expect(resolved.fromWebsite).toBe(false);
  });

  it("reads services off the website before the catalog and never mixes the two", () => {
    const resolved = resolveServiceOptions({
      websiteServices: ["Root canal", "Teeth whitening"],
      catalogServices: ["Cleaning", "Fillings"],
    });
    expect(resolved.services).toEqual(["Root canal", "Teeth whitening"]);
    expect(resolved.source).toBe("website");
    expect(resolved.sources).toEqual(["website"]);
    expect(resolved.fromWebsite).toBe(true);
  });

  it("keeps the Google profile ahead of the website and dedupes across tiers", () => {
    const resolved = resolveServiceOptions({
      gbpServiceItems: [{ name: "job_type_id:deep_cleaning" }, { name: "Fillings" }],
      websiteServices: ["Deep cleaning", "Whitening"],
      catalogServices: catalog,
    });
    expect(resolved.services).toEqual(["Deep cleaning", "Fillings", "Whitening"]);
    expect(resolved.sources).toEqual(["google_profile", "website"]);
    expect(resolved.fromGoogleProfile).toBe(true);
  });

  it("drops services the owner excluded and reports them", () => {
    const resolved = resolveServiceOptions({
      gbpServiceItems: [{ name: "Fillings" }],
      websiteServices: ["Whitening", "Our Team"],
      excluded: ["our team", "Fillings"],
      catalogServices: catalog,
    });
    expect(resolved.services).toEqual(["Whitening"]);
    expect(resolved.excluded).toEqual(["Fillings", "Our Team"]);
    expect(resolved.source).toBe("website");
  });

  it("falls back to the catalog when every real service is excluded", () => {
    const resolved = resolveServiceOptions({
      websiteServices: ["Whitening"],
      excluded: ["whitening"],
      catalogServices: catalog,
    });
    expect(resolved.services).toEqual(catalog);
    expect(resolved.source).toBe("catalog");
    expect(resolved.excluded).toEqual(["Whitening"]);
  });
});
