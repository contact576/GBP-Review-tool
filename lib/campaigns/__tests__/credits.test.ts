import { describe, expect, it } from "vitest";
import { estimateCampaignCredits, smsSegments } from "../credits";
import { checkCampaignContent } from "../content";

describe("SMS segment counting", () => {
  it("counts a short GSM-7 message as one segment", () => {
    expect(smsSegments("Short note.")).toBe(1);
    expect(smsSegments("x".repeat(160))).toBe(1);
  });

  it("splits at 153 characters once a message is multipart", () => {
    expect(smsSegments("x".repeat(161))).toBe(2);
    expect(smsSegments("x".repeat(306))).toBe(2);
    expect(smsSegments("x".repeat(307))).toBe(3);
  });

  it("charges GSM-7 extended characters as two", () => {
    expect(smsSegments("x".repeat(159) + "{")).toBe(2);
  });

  it("drops to UCS-2 sizing when the body is not GSM-7", () => {
    expect(smsSegments("héllo ☕".padEnd(71, "a"))).toBeGreaterThan(1);
    expect(smsSegments("☕".repeat(70))).toBe(1);
    expect(smsSegments("☕".repeat(71))).toBe(2);
  });
});

describe("credit estimate", () => {
  const usage = { smsCreditsUsed: 400, smsCreditsTotal: 500 };

  it("costs nothing for email", () => {
    const estimate = estimateCampaignCredits({
      channel: "email",
      recipients: 900,
      body: "x".repeat(400),
      usage,
    });
    expect(estimate.creditsRequired).toBe(0);
    expect(estimate.withinAllowance).toBe(true);
    expect(estimate.message).toMatch(/does not use SMS credits/);
  });

  it("multiplies segments by recipients", () => {
    const estimate = estimateCampaignCredits({
      channel: "sms",
      recipients: 60,
      body: "x".repeat(200),
      usage,
    });
    expect(estimate.segmentsPerMessage).toBe(2);
    expect(estimate.creditsRequired).toBe(120);
    expect(estimate.creditsRemaining).toBe(100);
    expect(estimate.withinAllowance).toBe(false);
    expect(estimate.message).toMatch(/only 100 remain/);
  });

  it("fits when the send is inside the remaining allowance", () => {
    const estimate = estimateCampaignCredits({
      channel: "sms",
      recipients: 50,
      body: "Short.",
      usage,
    });
    expect(estimate.creditsRequired).toBe(50);
    expect(estimate.withinAllowance).toBe(true);
  });

  it("treats a negative total as uncapped", () => {
    const estimate = estimateCampaignCredits({
      channel: "sms",
      recipients: 10_000,
      body: "Short.",
      usage: { smsCreditsUsed: 9_999, smsCreditsTotal: -1 },
    });
    expect(estimate.unlimited).toBe(true);
    expect(estimate.withinAllowance).toBe(true);
  });

  it("never reports negative remaining credits after an overrun", () => {
    const estimate = estimateCampaignCredits({
      channel: "sms",
      recipients: 1,
      body: "Short.",
      usage: { smsCreditsUsed: 600, smsCreditsTotal: 500 },
    });
    expect(estimate.creditsRemaining).toBe(0);
    expect(estimate.withinAllowance).toBe(false);
  });
});

describe("campaign content lints", () => {
  it("blocks incentives offered for a review", () => {
    const check = checkCampaignContent({
      body: "Leave a review and get a free coffee.",
      businessName: "Harbourview Physiotherapy",
    });
    expect(check.ok).toBe(false);
    expect(check.blocking[0]?.code).toBe("incentive_language");
  });

  it("checks the subject line too", () => {
    const check = checkCampaignContent({
      subject: "A gift card for your review",
      body: "Thanks for visiting.",
    });
    expect(check.ok).toBe(false);
  });

  it("warns without blocking on keyword stuffing", () => {
    const check = checkCampaignContent({
      body: "Harbourview is great. Visit Harbourview. Book Harbourview today at Harbourview.",
      businessName: "Harbourview Physiotherapy",
    });
    expect(check.ok).toBe(true);
    expect(check.warnings.some((flag) => flag.code === "name_stuffing")).toBe(true);
  });

  it("warns without blocking on over-claimed attribution", () => {
    const check = checkCampaignContent({ body: "See the new customers we won for you." });
    expect(check.ok).toBe(true);
    expect(check.warnings.some((flag) => flag.code === "attribution_dishonesty")).toBe(true);
  });

  it("passes ordinary campaign copy", () => {
    const check = checkCampaignContent({
      subject: "Time for a check-in?",
      body: "Hi {first_name}, it has been a while. Book whenever suits you.",
      businessName: "Harbourview Physiotherapy",
    });
    expect(check.ok).toBe(true);
    expect(check.warnings).toHaveLength(0);
  });
});
