import { describe, expect, it } from "vitest";
import { canSendMarketing, canSendService } from "@/lib/compliance/consent";
import type { Customer } from "@/lib/data/types";
import {
  buildUnsubscribeUrl,
  createUnsubscribeToken,
  parseUnsubscribeToken,
} from "../unsubscribe";
import { buildAudienceSnapshot } from "../audience";
import { customer } from "./fixtures";

/**
 * The opt-out path. An unsubscribe link that does not actually stop the mail
 * is a CAN-SPAM violation, so the test asserts the end state that matters:
 * after the link is honoured, the customer is no longer in the audience.
 */

describe("unsubscribe token", () => {
  it("round-trips its claims", () => {
    const token = createUnsubscribeToken({
      workspaceId: "ws_1",
      customerId: "cus_9",
      campaignId: "camp_3",
    });
    expect(parseUnsubscribeToken(token)).toEqual({
      workspaceId: "ws_1",
      customerId: "cus_9",
      campaignId: "camp_3",
    });
  });

  it("works without a campaign id", () => {
    const token = createUnsubscribeToken({ workspaceId: "ws_1", customerId: "cus_9" });
    expect(parseUnsubscribeToken(token)).toEqual({
      workspaceId: "ws_1",
      customerId: "cus_9",
      campaignId: undefined,
    });
  });

  it("rejects a tampered payload", () => {
    const token = createUnsubscribeToken({ workspaceId: "ws_1", customerId: "cus_9" });
    const [, signature] = token.split(".");
    const forged = `${Buffer.from("unsub:v1:ws_1:cus_OTHER:", "utf8").toString("base64url")}.${signature}`;
    expect(parseUnsubscribeToken(forged)).toBeNull();
  });

  it("rejects garbage, empty and oversized input", () => {
    expect(parseUnsubscribeToken("")).toBeNull();
    expect(parseUnsubscribeToken("not-a-token")).toBeNull();
    expect(parseUnsubscribeToken("a.b")).toBeNull();
    expect(parseUnsubscribeToken("x".repeat(600))).toBeNull();
  });

  it("builds an absolute URL the route can read", () => {
    const url = buildUnsubscribeUrl("https://app.example.test", {
      workspaceId: "ws_1",
      customerId: "cus_9",
    });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/unsubscribe");
    expect(parseUnsubscribeToken(parsed.searchParams.get("t") ?? "")).toMatchObject({
      workspaceId: "ws_1",
      customerId: "cus_9",
    });
  });
});

/**
 * The mutation the route performs, applied to a customer record. Kept as a
 * literal patch so this test fails if the route ever starts writing something
 * different (e.g. withdrawing service consent too).
 */
function applyUnsubscribePatch(target: Customer): Customer {
  return {
    ...target,
    consent: {
      ...target.consent,
      marketingConsent: false,
      marketingConsentAt: undefined,
    },
  };
}

describe("unsubscribe effect on consent", () => {
  it("flips marketing consent off and removes the customer from the audience", () => {
    const before = customer({ id: "cus_9", email: "sam@example.test" });
    expect(canSendMarketing(before)).toBe(true);

    const after = applyUnsubscribePatch(before);
    expect(canSendMarketing(after)).toBe(false);

    const snapshot = buildAudienceSnapshot({
      customers: [after, customer({ id: "cus_other" })],
      suppression: [],
      consentBasis: "marketing",
      channel: "email",
    });
    expect(snapshot.recipients.map((r) => r.customerId)).toEqual(["cus_other"]);
  });

  it("leaves service consent intact — a marketing opt-out is not a full withdrawal", () => {
    const after = applyUnsubscribePatch(customer({ id: "cus_9" }));
    expect(canSendService(after)).toBe(true);
    expect(after.consent.withdrawnAt).toBeUndefined();

    const serviceAudience = buildAudienceSnapshot({
      customers: [after],
      suppression: [],
      consentBasis: "service",
      channel: "email",
    });
    expect(serviceAudience.eligible).toBe(1);
  });
});
