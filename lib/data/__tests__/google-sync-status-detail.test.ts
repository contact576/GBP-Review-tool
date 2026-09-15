import { describe, expect, it } from "vitest";
import { googleIntegrationDetail, googleIntegrationStatus } from "../google-sync-status";

describe("google integration detail carries Google's own reason", () => {
  it("appends what Google said when public data stood in for a pending approval", () => {
    const detail = googleIntegrationDetail(
      {
        source: "google_public_scrape",
        publicDataReason: "approval_pending",
        publicDataDetail:
          "The My Business APIs are not enabled for this Google Cloud project. Google said: Service disabled",
        reviewCount: 46,
      },
      46,
    );
    expect(detail).toContain("46 reviews imported from public Google data");
    expect(detail).toContain("not enabled for this Google Cloud project");
    expect(detail).toContain("Google said: Service disabled");
  });

  it("says nothing extra when Google gave no reason", () => {
    const detail = googleIntegrationDetail(
      { source: "google_public_scrape", publicDataReason: "approval_pending", reviewCount: 3 },
      3,
    );
    expect(detail).toBe(
      "3 reviews imported from public Google data — views, calls and direction requests need Business Profile approval and are not measured",
    );
    expect(googleIntegrationStatus({ source: "google_public_scrape" })).toBe("needs_attention");
  });
});
