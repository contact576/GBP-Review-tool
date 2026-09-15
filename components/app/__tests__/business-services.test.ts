import { describe, it, expect } from "vitest";
import {
  MAX_OWNER_SERVICES,
  MAX_SERVICE_LENGTH,
  cleanServiceValue,
  normalizeOwnerServices,
  ownerServicesProblem,
} from "../business-services";

describe("normalizeOwnerServices", () => {
  it("trims, collapses whitespace, and drops blank rows", () => {
    const result = normalizeOwnerServices(["  Deep   cleaning ", "", "   ", "Move-out clean"]);
    expect(result.services).toEqual(["Deep cleaning", "Move-out clean"]);
    expect(result.duplicatesRemoved).toBe(0);
  });

  it("dedupes case-insensitively and keeps the owner's first spelling", () => {
    const result = normalizeOwnerServices(["Deep Cleaning", "deep cleaning", "DEEP CLEANING"]);
    expect(result.services).toEqual(["Deep Cleaning"]);
    expect(result.duplicatesRemoved).toBe(2);
  });

  it("reports entries the downstream consumers would silently drop", () => {
    const long = "x".repeat(MAX_SERVICE_LENGTH + 1);
    const result = normalizeOwnerServices(["ok service", "ab", long]);
    expect(result.services).toEqual(["ok service"]);
    expect(result.tooShort).toEqual(["ab"]);
    expect(result.tooLong).toEqual([long]);
    expect(ownerServicesProblem(result)).toContain("at least");
  });

  it("flags a list longer than the product can ever show", () => {
    const values = Array.from({ length: MAX_OWNER_SERVICES + 2 }, (_, i) => `Service ${i + 1}`);
    const result = normalizeOwnerServices(values);
    expect(result.overflow).toBe(2);
    expect(ownerServicesProblem(result)).toContain(`${MAX_OWNER_SERVICES}`);
  });

  it("accepts a clean list with no problem", () => {
    const result = normalizeOwnerServices(["Dine-in", "Takeout", "Catering"]);
    expect(result.services).toEqual(["Dine-in", "Takeout", "Catering"]);
    expect(ownerServicesProblem(result)).toBeNull();
  });

  it("strips control characters rather than storing them", () => {
    const nul = String.fromCharCode(0);
    const bell = String.fromCharCode(7);
    expect(cleanServiceValue(`Deep${nul} clean${bell}ing`)).toBe("Deep cleaning");
  });
});
