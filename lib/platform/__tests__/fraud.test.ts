import { describe, expect, it } from "vitest";
import {
  BURST_MIN_REQUESTS_PER_HOUR,
  FRAUD_SIGNALS_RUN,
  detectFraud,
  detectRequestBurst,
  detectReviewVelocity,
  detectStaffSelfReview,
  type FraudRequestRow,
  type FraudReviewRow,
} from "@/lib/platform/fraud";

const now = new Date("2026-09-03T12:00:00Z");
const HOUR = 3_600_000;
const DAY = 86_400_000;

function iso(msAgo: number): string {
  return new Date(now.getTime() - msAgo).toISOString();
}

function request(over: Partial<FraudRequestRow> & { id: string }): FraudRequestRow {
  return {
    workspaceId: "ws_a",
    customerId: `cus_${over.id}`,
    staffId: null,
    status: "sent",
    createdAt: iso(2 * HOUR),
    isTest: false,
    ...over,
  };
}

function review(msAgo: number, matched = true): FraudReviewRow {
  return { workspaceId: "ws_a", publishedAt: iso(msAgo), matchedRequestId: matched ? "req_x" : null };
}

describe("detectReviewVelocity", () => {
  it("flags a day far above the tenant's own baseline, with a stable id", () => {
    const reviews = [
      ...Array.from({ length: 9 }, (_, i) => review(i * HOUR)),
      // Baseline: 3 matched reviews over the prior 30 days ≈ 0.1/day → floor 0.5/day
      review(5 * DAY),
      review(12 * DAY),
      review(20 * DAY),
    ];
    const flag = detectReviewVelocity(reviews, "Acme", "ws_a", now);
    expect(flag).not.toBeNull();
    expect(flag?.id).toBe("ff_ws_a_velocity_reviews_2026-09-03");
    expect(flag?.severity).toBe("medium");
    expect(flag?.detail).toMatch(/9 captured Google reviews in 24h/);
  });

  it("does not flag a busy tenant whose day is in line with its baseline", () => {
    // 6 today, but ~6/day for the last month too.
    const reviews = [
      ...Array.from({ length: 6 }, (_, i) => review(i * HOUR)),
      ...Array.from({ length: 180 }, (_, i) => review(DAY + i * (4 * HOUR))),
    ];
    expect(detectReviewVelocity(reviews, "Acme", "ws_a", now)).toBeNull();
  });

  it("ignores reviews that were never matched to a request", () => {
    const reviews = Array.from({ length: 20 }, (_, i) => review(i * HOUR, false));
    expect(detectReviewVelocity(reviews, "Acme", "ws_a", now)).toBeNull();
  });
});

describe("detectRequestBurst", () => {
  it("flags a sliding one-hour window at or above the threshold and skips test sends", () => {
    const burst = Array.from({ length: BURST_MIN_REQUESTS_PER_HOUR }, (_, i) =>
      request({ id: `r${i}`, createdAt: iso(DAY + i * 60_000) }),
    );
    const tests = Array.from({ length: 40 }, (_, i) =>
      request({ id: `t${i}`, createdAt: iso(HOUR + i * 1000), isTest: true }),
    );
    const flag = detectRequestBurst([...burst, ...tests], "Acme", "ws_a", now);
    expect(flag?.kind).toBe("velocity_anomaly");
    expect(flag?.severity).toBe("medium");
    expect(flag?.detail).toMatch(new RegExp(`${BURST_MIN_REQUESTS_PER_HOUR} review requests sent within one hour`));
    expect(flag?.id).toMatch(/^ff_ws_a_velocity_burst_2026-09-02T/);
  });

  it("does not flag the same volume spread across a day", () => {
    const spread = Array.from({ length: 40 }, (_, i) =>
      request({ id: `r${i}`, createdAt: iso(DAY + i * 40 * 60_000) }),
    );
    expect(detectRequestBurst(spread, "Acme", "ws_a", now)).toBeNull();
  });
});

describe("detectStaffSelfReview", () => {
  const base = {
    users: [{ workspaceId: "ws_a", email: "Owner@Acme.ca" }],
    staff: [{ workspaceId: "ws_a", id: "stf_1", displayName: "Priya Sharma" }],
  };

  it("matches a customer to a workspace login by email and rates a posted review high", () => {
    const flags = detectStaffSelfReview(
      {
        ...base,
        customers: [{ workspaceId: "ws_a", id: "cus_1", name: "Someone Else", email: "owner@acme.ca" }],
        requests: [request({ id: "r1", customerId: "cus_1", status: "posted_google" })],
      },
      "Acme",
      "ws_a",
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ id: "ff_ws_a_self_cus_1", kind: "staff_self_review", severity: "high" });
    expect(flags[0]?.detail).toMatch(/workspace login's email/);
  });

  it("matches a customer to a staff member by name and rates an unopened request low", () => {
    const flags = detectStaffSelfReview(
      {
        ...base,
        customers: [{ workspaceId: "ws_a", id: "cus_2", name: "  priya   SHARMA ", email: null }],
        requests: [request({ id: "r2", customerId: "cus_2", status: "sent" })],
      },
      "Acme",
      "ws_a",
    );
    expect(flags[0]).toMatchObject({ severity: "low" });
    expect(flags[0]?.detail).toMatch(/staff member Priya Sharma/);
  });

  it("never flags a team member who was only ever sent a test request, or never asked at all", () => {
    const flags = detectStaffSelfReview(
      {
        ...base,
        customers: [
          { workspaceId: "ws_a", id: "cus_3", name: "Priya Sharma", email: null },
          { workspaceId: "ws_a", id: "cus_4", name: "Owner", email: "owner@acme.ca" },
        ],
        requests: [request({ id: "r3", customerId: "cus_3", isTest: true })],
      },
      "Acme",
      "ws_a",
    );
    expect(flags).toEqual([]);
  });
});

describe("detectFraud", () => {
  it("declares which detectors run", () => {
    expect(FRAUD_SIGNALS_RUN).toEqual({ velocity_anomaly: true, staff_self_review: true, same_device: false });
  });

  it("scopes every signal to its tenant, attaches triage by id and sorts by severity", () => {
    const flags = detectFraud({
      requests: [
        request({ id: "r1", workspaceId: "ws_a", customerId: "cus_1", status: "posted_google" }),
        request({ id: "r2", workspaceId: "ws_b", customerId: "cus_9", status: "sent" }),
      ],
      reviews: [],
      customers: [
        { workspaceId: "ws_a", id: "cus_1", name: "Priya Sharma", email: null },
        { workspaceId: "ws_b", id: "cus_9", name: "Priya Sharma", email: null }, // no such staff in ws_b
      ],
      staff: [{ workspaceId: "ws_a", id: "stf_1", displayName: "Priya Sharma" }],
      users: [],
      tenantNameByWorkspace: new Map([
        ["ws_a", "Acme"],
        ["ws_b", "Beta"],
      ]),
      triage: [
        { flagId: "ff_ws_a_self_cus_1", workspaceId: "ws_a", decision: "dismissed", operator: "ops@foundly", at: now.toISOString() },
      ],
      now,
    });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ tenant: "Acme", workspaceId: "ws_a", severity: "high" });
    expect(flags[0]?.triage?.decision).toBe("dismissed");
  });

  it("skips workspaces the roster does not name (demo, ops, test accounts)", () => {
    const flags = detectFraud({
      requests: [request({ id: "r1", workspaceId: "ws_demo", customerId: "cus_1", status: "posted_google" })],
      reviews: [],
      customers: [{ workspaceId: "ws_demo", id: "cus_1", name: "Priya Sharma", email: null }],
      staff: [{ workspaceId: "ws_demo", id: "stf_1", displayName: "Priya Sharma" }],
      users: [],
      tenantNameByWorkspace: new Map(),
      triage: [],
      now,
    });
    expect(flags).toEqual([]);
  });
});
