import { describe, it, expect } from "vitest";
import { latestRequestByCustomer, retryCandidates, retryCandidatesByCustomer } from "@/lib/requests/retry";
import type { Channel, Customer, RequestStatus, ReviewRequest } from "@/lib/data/types";

function customer(over: Partial<Customer> & { id: string }): Customer {
  return {
    locationId: "loc_1",
    name: "Dana R.",
    email: "dana@example.com",
    phone: "+14155550123",
    createdAt: "2026-07-01T00:00:00.000Z",
    source: "staff",
    visitCount: 1,
    lifecycleStage: "requested",
    consent: {
      serviceConsent: true,
      marketingConsent: false,
      consentChannel: "in_person",
      consentSourceText: "Asked at the desk",
      caslCaptured: true,
    },
    tags: [],
    ...over,
  } as Customer;
}

function request(over: Partial<ReviewRequest> & { id: string; customerId: string }): ReviewRequest {
  return {
    locationId: "loc_1",
    customerName: "Dana R.",
    channel: "email" as Channel,
    token: `tok_${over.id}`,
    status: "failed" as RequestStatus,
    isTest: false,
    createdAt: "2026-07-10T00:00:00.000Z",
    attributes: [],
    ...over,
  } as ReviewRequest;
}

describe("latestRequestByCustomer", () => {
  it("keeps the most recent request per customer", () => {
    const older = request({ id: "req_1", customerId: "c1", createdAt: "2026-07-01T00:00:00.000Z" });
    const newer = request({ id: "req_2", customerId: "c1", createdAt: "2026-07-09T00:00:00.000Z" });
    const latest = latestRequestByCustomer([older, newer]);
    expect(latest.get("c1")!.id).toBe("req_2");
  });

  it("prefers the sent time over the creation time", () => {
    const created_later = request({ id: "req_1", customerId: "c1", createdAt: "2026-07-09T00:00:00.000Z" });
    const sent_later = request({
      id: "req_2",
      customerId: "c1",
      createdAt: "2026-07-01T00:00:00.000Z",
      sentAt: "2026-07-20T00:00:00.000Z",
    });
    expect(latestRequestByCustomer([created_later, sent_later]).get("c1")!.id).toBe("req_2");
  });
});

describe("retryCandidates", () => {
  it("offers a customer whose only request failed to deliver", () => {
    const c = customer({ id: "c1" });
    const candidates = retryCandidates([request({ id: "req_1", customerId: "c1" })], [c]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.requestId).toBe("req_1");
    expect(candidates[0]!.failedChannel).toBe("email");
  });

  it("suggests the other channel when we hold that contact detail", () => {
    const withBoth = retryCandidates(
      [request({ id: "r", customerId: "c1", channel: "email" })],
      [customer({ id: "c1" })],
    );
    expect(withBoth[0]!.suggestedChannel).toBe("sms");

    const smsFailed = retryCandidates(
      [request({ id: "r", customerId: "c1", channel: "sms" })],
      [customer({ id: "c1" })],
    );
    expect(smsFailed[0]!.suggestedChannel).toBe("email");
  });

  it("keeps the same channel when the other contact detail is missing", () => {
    const noPhone = retryCandidates(
      [request({ id: "r", customerId: "c1", channel: "email" })],
      [customer({ id: "c1", phone: undefined })],
    );
    expect(noPhone[0]!.suggestedChannel).toBe("email");
  });

  it("never re-asks a suppressed customer, whatever the request says", () => {
    const suppressed = customer({ id: "c1", suppressedReason: "Opted out" });
    expect(retryCandidates([request({ id: "r", customerId: "c1" })], [suppressed])).toEqual([]);
  });

  it("never re-asks someone whose message actually reached them", () => {
    const reached: RequestStatus[] = ["sent", "delivered", "opened", "clicked", "posted_google", "private_feedback"];
    for (const status of reached) {
      expect(retryCandidates([request({ id: "r", customerId: "c1", status })], [customer({ id: "c1" })])).toEqual([]);
    }
  });

  it("ignores a WhatsApp request, which is waiting on the owner rather than failed in transit", () => {
    const wa = request({ id: "r", customerId: "c1", channel: "whatsapp" });
    expect(retryCandidates([wa], [customer({ id: "c1" })])).toEqual([]);
  });

  it("does not offer a retry once a later request went through", () => {
    const failed = request({ id: "r1", customerId: "c1", createdAt: "2026-07-01T00:00:00.000Z" });
    const then_sent = request({
      id: "r2",
      customerId: "c1",
      status: "delivered",
      createdAt: "2026-07-05T00:00:00.000Z",
    });
    expect(retryCandidates([failed, then_sent], [customer({ id: "c1" })])).toEqual([]);
  });

  it("offers a retry when the newest attempt failed after an older one did too", () => {
    const first = request({ id: "r1", customerId: "c1", createdAt: "2026-07-01T00:00:00.000Z" });
    const second = request({ id: "r2", customerId: "c1", createdAt: "2026-07-05T00:00:00.000Z" });
    const candidates = retryCandidates([first, second], [customer({ id: "c1" })]);
    expect(candidates.map((c) => c.requestId)).toEqual(["r2"]);
  });

  it("says nothing about a customer who was never asked", () => {
    expect(retryCandidates([], [customer({ id: "c1" })])).toEqual([]);
  });
});

describe("retryCandidatesByCustomer", () => {
  it("keys the candidate by customer so a row can ask about itself", () => {
    const c = customer({ id: "c1" });
    const byCustomer = retryCandidatesByCustomer([request({ id: "r1", customerId: "c1" })], [c]);
    expect(byCustomer.get("c1")!.requestId).toBe("r1");
  });

  it("points at the latest failed attempt, not an older one", () => {
    const older = request({ id: "r1", customerId: "c1", createdAt: "2026-07-01T00:00:00.000Z" });
    const newer = request({ id: "r2", customerId: "c1", createdAt: "2026-07-08T00:00:00.000Z" });
    const byCustomer = retryCandidatesByCustomer([older, newer], [customer({ id: "c1" })]);
    expect(byCustomer.get("c1")!.requestId).toBe("r2");
  });

  it("holds nothing for a customer who was reached", () => {
    const reached = request({ id: "r1", customerId: "c1", status: "delivered" });
    expect(retryCandidatesByCustomer([reached], [customer({ id: "c1" })]).size).toBe(0);
  });
});
