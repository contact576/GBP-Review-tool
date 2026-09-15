import { describe, expect, it } from "vitest";
import { isPlausibleNameMatch } from "../places";

/**
 * Guards the free score tool against stating a stranger's rating as the
 * caller's own. Places Text Search always returns its best effort, so the
 * decision that matters is whether that effort actually names the business the
 * visitor typed.
 */
describe("isPlausibleNameMatch", () => {
  it("accepts the listing when the typed name carries an extra location word", () => {
    // What the score tool sends: the visitor types their city too.
    expect(isPlausibleNameMatch("Priority Plumbing & Drains Toronto", "Priority Plumbing & Drains")).toBe(true);
  });

  it("accepts the listing when the listing carries extra words the visitor omitted", () => {
    expect(isPlausibleNameMatch("Bright Smile", "Bright Smile Dental Clinic")).toBe(true);
  });

  it("rejects the unrelated business the category default used to surface", () => {
    // The exact regression: category "Physiotherapy" was appended to a
    // plumber's query and Places returned a real, confidently-rated clinic.
    expect(isPlausibleNameMatch("Priority Plumbing & Drains Toronto", "Tru Physiotherapy")).toBe(false);
  });

  it("rejects a match resting only on an industry word", () => {
    expect(isPlausibleNameMatch("Dental", "Bright Smile Dental Clinic")).toBe(false);
    expect(isPlausibleNameMatch("Toronto Plumbing", "Rapid Plumbing")).toBe(false);
  });

  it("ignores punctuation, case and accents", () => {
    expect(isPlausibleNameMatch("cafe lumiere", "Café Lumière")).toBe(true);
    expect(isPlausibleNameMatch("O'Brien & Sons", "OBrien and Sons")).toBe(true);
  });

  it("rejects empty or unusable input rather than guessing", () => {
    expect(isPlausibleNameMatch("", "Priority Plumbing")).toBe(false);
    expect(isPlausibleNameMatch("Priority Plumbing", "")).toBe(false);
  });

  it("holds when a competing listing shares only the generic half of the name", () => {
    expect(isPlausibleNameMatch("Priority Plumbing", "Downtown Plumbing")).toBe(false);
  });
});
