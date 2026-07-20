import { describe, expect, it } from "vitest";
import { makeSlug } from "@/lib/data/empty";

describe("public QR slugs", () => {
  it("normalizes Nano ID characters into a lowercase URL-safe suffix", () => {
    const slug = makeSlug("Trattoria Nova", "ws_Ab_Cd-Ef123456789");
    expect(slug).toBe("trattoria-nova-abcdef123456");
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("keeps twelve normalized salt characters to reduce tenant collisions", () => {
    expect(makeSlug("Same Name", "ws_abcdefghijkl-one")).not.toBe(
      makeSlug("Same Name", "ws_abcdefghijkm-two"),
    );
  });

  it("caps the readable business-name segment", () => {
    const slug = makeSlug("A very long business name that should be safely shortened", "ws_abcdef123456");
    expect(slug.split("-abcdef123456")[0]?.length).toBeLessThanOrEqual(32);
  });
});
