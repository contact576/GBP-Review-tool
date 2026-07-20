import { describe, expect, it } from "vitest";
import {
  approvalPolicyFor,
  assertApprovedForExecution,
  scoreApplicableCapabilities,
} from "../product-policy";
import {
  checkFaithfulReviewEdit,
  normalizeCustomerReviewText,
} from "../review-assistance";

describe("applicable profile capability scoring", () => {
  it("excludes unsupported capabilities from the score", () => {
    expect(scoreApplicableCapabilities([
      { key: "description", status: "complete" },
      { key: "services", status: "partial" },
      { key: "products", status: "not_applicable", weight: 10 },
      { key: "hours", status: "missing" },
    ])).toMatchObject({
      score: 50,
      applicableCount: 3,
      excludedCount: 1,
      completeCount: 1,
      partialCount: 1,
      missingCount: 1,
    });
  });
});
describe("profile publication approval", () => {
  it("requires fact confirmation for high-risk identity changes", () => {
    expect(approvalPolicyFor("primary_category")).toMatchObject({
      risk: "high",
      requiresExplicitApproval: true,
      requiresFactConfirmation: true,
    });
    expect(() => assertApprovedForExecution({
      target: "primary_category",
      approvedAt: new Date().toISOString(),
      approvedBy: "owner_1",
    })).toThrow(/facts/i);
  });

  it("allows a low-risk post only after explicit approval", () => {
    expect(() => assertApprovedForExecution({ target: "local_post" })).toThrow(/approval/i);
    expect(() => assertApprovedForExecution({
      target: "local_post",
      approvedAt: new Date().toISOString(),
      approvedBy: "owner_1",
    })).not.toThrow();
  });
});

describe("customer-authored review assistance", () => {
  it("normalizes only the customer's own words", () => {
    expect(normalizeCustomerReviewText("  staff were kind   and helpful  "))
      .toBe("Staff were kind and helpful.");
  });

  it("rejects invented promotional content and numbers", () => {
    expect(checkFaithfulReviewEdit(
      "The staff were kind and helpful.",
      "The staff were kind and helpful. Five stars and highly recommend this top-rated clinic.",
    ).ok).toBe(false);
    expect(checkFaithfulReviewEdit(
      "I waited for my appointment.",
      "I waited 45 minutes for my appointment.",
    ).reasons).toContain("invented_number");
  });

  it("accepts a light grammar cleanup", () => {
    expect(checkFaithfulReviewEdit(
      "staff were kind and helpful",
      "The staff were kind and helpful.",
    ).ok).toBe(true);
  });
});
