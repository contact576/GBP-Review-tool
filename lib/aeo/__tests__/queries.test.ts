import { describe, expect, it } from "vitest";
import { blockerSentence, buildDefaultQueries } from "../queries";
import { buildAeoContext, type AeoContextSource } from "../context";
import type { AeoBusinessContext } from "../types";

function context(overrides: Partial<AeoBusinessContext> = {}): AeoBusinessContext {
  return {
    locationId: "loc_1",
    businessName: "Northline Bakery",
    city: "Halifax",
    category: "Bakery",
    services: ["Sourdough loaves", "Wedding cakes", "Gluten-free pastries"],
    servicesSource: "google_profile",
    ...overrides,
  };
}

/** Minimal but structurally real workspace/location fixture. */
function source(overrides: {
  category?: string;
  primaryCategory?: string;
  city?: string;
  vertical?: string;
  serviceItems?: { name?: string; categoryName?: string }[];
  customServices?: string[];
}): AeoContextSource {
  return {
    location: {
      id: "loc_1",
      workspaceId: "ws_1",
      name: "Northline Bakery",
      category: overrides.category ?? "Bakery",
      vertical: overrides.vertical ?? "bakery",
      address: "1 Water St",
      city: overrides.city ?? "Halifax",
      region: "CA",
      timezone: "America/Halifax",
      reviewUrl: "https://example.test",
      rating: 4.7,
      reviewCount: 88,
      joinedAt: "2026-01-01T00:00:00.000Z",
      gbpConnected: true,
      profile: {
        description: "",
        primaryCategory: overrides.primaryCategory ?? "",
        secondaryCategories: [],
        photoCount: 0,
        postCount: 0,
        qnaCount: 0,
        hoursSet: true,
        holidayHoursSet: false,
        servicesWithDescriptions: 0,
        servicesTotal: 0,
        responseRate: 0.5,
        completeness: 60,
      },
      ...(overrides.serviceItems
        ? {
            gbpSnapshot: {
              schemaVersion: 1 as const,
              source: "google_business_profile" as const,
              accountResource: "accounts/1",
              locationResource: "locations/1",
              syncedAt: "2026-01-01T00:00:00.000Z",
              location: {
                name: "locations/1",
                serviceItems: overrides.serviceItems.map((item) => ({
                  ...item,
                  source: "structured" as const,
                })),
              },
              attributes: [],
              availableAttributes: [],
              media: [],
              localPosts: [],
              questions: [],
              searchKeywords: [],
              capabilities: [],
              capabilityScore: {
                score: 0,
                applicableCount: 0,
                completeCount: 0,
                partialCount: 0,
                missingCount: 0,
                unknownCount: 0,
                excludedCount: 0,
              },
              reviewResponseRate: 0,
              sourceStatus: {
                location: "synced" as const,
                attributes: "synced" as const,
                attributeMetadata: "synced" as const,
                media: "synced" as const,
                posts: "synced" as const,
                questions: "synced" as const,
                reviews: "synced" as const,
                performance: "synced" as const,
                searchKeywords: "synced" as const,
                googleUpdates: "synced" as const,
              },
              warnings: [],
            },
          }
        : {}),
    },
    workspace: {
      id: "ws_1",
      organizationId: "org_1",
      name: "Northline Bakery",
      vertical: overrides.vertical ?? "bakery",
      region: "CA",
      timezone: "America/Halifax",
      plan: "growth",
      createdAt: "2026-01-01T00:00:00.000Z",
      ...(overrides.customServices ? { industryConfig: { customServices: overrides.customServices } } : {}),
    },
  } as AeoContextSource;
}

describe("AEO query-set generation", () => {
  it("builds every query from the workspace's own category, city and services", () => {
    const plan = buildDefaultQueries(context(), 6);

    expect(plan.queries).toHaveLength(6);
    for (const query of plan.queries) {
      expect(query).toContain("in Halifax");
    }
    expect(plan.queries[0]).toBe("best bakery in Halifax");
    expect(plan.queries.some((q) => q.includes("sourdough loaves"))).toBe(true);
    expect(plan.queries.some((q) => q.includes("wedding cakes"))).toBe(true);
    expect(plan.blockers).toEqual([]);
  });

  it("carries no trace of the seeded physiotherapy demo", () => {
    const plan = buildDefaultQueries(context(), 8);
    const joined = plan.queries.join(" ").toLowerCase();
    expect(joined).not.toContain("physio");
    expect(joined).not.toContain("toronto");
    expect(joined).not.toContain("dry needling");
  });

  it("produces a different set for a different vertical using the same templates", () => {
    const plumber = buildDefaultQueries(
      context({
        businessName: "Ridgeway Plumbing",
        city: "Boise",
        category: "Plumber",
        services: ["Emergency leak repair"],
      }),
      4,
    );
    expect(plumber.queries[0]).toBe("best plumber in Boise");
    expect(plumber.queries).toContain("where can I get emergency leak repair in Boise");
    expect(plumber.queries.join(" ")).not.toContain("bakery");
  });

  it("falls back to 'near me' and flags the gap when no city is known", () => {
    const plan = buildDefaultQueries(context({ city: "" }), 4);
    expect(plan.queries[0]).toBe("best bakery near me");
    const city = plan.blockers.find((blocker) => blocker.id === "city");
    expect(city?.blocking).toBe(false);
    expect(city?.fix).toMatch(/city/i);
    expect(city?.href).toBe("/app/settings/locations");
  });

  it("refuses to write questions with no category, rather than inventing one", () => {
    const plan = buildDefaultQueries(context({ category: "" }), 4);
    expect(plan.queries).toEqual([]);
    const category = plan.blockers.find((blocker) => blocker.id === "category");
    expect(category?.blocking).toBe(true);
    expect(category?.fix).toMatch(/primary category/i);
    expect(category?.href).toBe("/app/settings/business");
  });

  it("flags a missing service list but still produces general questions", () => {
    const plan = buildDefaultQueries(context({ services: [] }), 6);
    expect(plan.queries.length).toBeGreaterThan(0);
    expect(plan.queries.every((query) => !query.includes("where can I get"))).toBe(true);
    const services = plan.blockers.find((blocker) => blocker.id === "services");
    expect(services?.blocking).toBe(false);
    expect(services?.fix).toMatch(/services/i);
  });

  it("states every blocker as a fix, a destination and an effect on this check", () => {
    const plan = buildDefaultQueries(
      context({ category: "", city: "", services: [] }),
      6,
    );
    expect(plan.blockers.map((blocker) => blocker.id)).toEqual([
      "category",
      "city",
      "services",
    ]);
    for (const blocker of plan.blockers) {
      expect(blocker.fix.length).toBeGreaterThan(0);
      expect(blocker.whereLabel.length).toBeGreaterThan(0);
      expect(blocker.href.startsWith("/app/")).toBe(true);
      expect(blocker.effect.length).toBeGreaterThan(0);
      // Never a causation claim: a gap explains this check, not an outcome.
      const sentence = blockerSentence(blocker).toLowerCase();
      expect(sentence.includes("rank")).toBe(false);
      expect(sentence.includes("guarantee")).toBe(false);
      expect(sentence.includes("customers gained")).toBe(false);
    }
  });

  it("honours the requested size and the hard per-run ceiling", () => {
    expect(buildDefaultQueries(context(), 2).queries).toHaveLength(2);
    expect(buildDefaultQueries(context(), 99).queries.length).toBeLessThanOrEqual(8);
  });
});

describe("AEO business context", () => {
  it("prefers the Google primary category over the stored category", () => {
    const built = buildAeoContext(source({ primaryCategory: "Artisan bakery", category: "Bakery" }));
    expect(built.category).toBe("Artisan bakery");
  });

  it("prefers real Google service items over workspace settings and the catalog", () => {
    const built = buildAeoContext(
      source({
        serviceItems: [{ name: "Sourdough loaves" }, { categoryName: "Wedding cakes" }],
        customServices: ["Should not be used"],
      }),
    );
    expect(built.services).toEqual(["Sourdough loaves", "Wedding cakes"]);
    expect(built.servicesSource).toBe("google_profile");
  });

  it("falls back to workspace-saved services when Google has none", () => {
    const built = buildAeoContext(source({ customServices: ["Cake tastings", "Cake tastings"] }));
    expect(built.services).toEqual(["Cake tastings"]);
    expect(built.servicesSource).toBe("workspace_settings");
  });

  it("falls back to the selected industry's catalog last, and says so", () => {
    const built = buildAeoContext(source({ vertical: "restaurant" }));
    expect(built.servicesSource).toBe("industry_catalog");
    expect(built.services.length).toBeGreaterThan(0);
  });
});
