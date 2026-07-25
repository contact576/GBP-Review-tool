import { describe, expect, it } from "vitest";
import type { AuditLog } from "@/lib/data/types";
import {
  AEO_RUN_ACTION,
  buildAeoRunAuditEntry,
  decodeAeoRun,
  latestAeoRun,
} from "../persistence";
import { aeoQuota, countRunsInMonth, monthlyRunLimit } from "../metering";
import { resolveAeoView, viewFromSnapshot } from "../view";
import type { AeoRunRecord } from "../types";

function record(overrides: Partial<AeoRunRecord> = {}): AeoRunRecord {
  return {
    schemaVersion: 1,
    runId: "aeo_1",
    ranAt: "2026-03-04T10:00:00.000Z",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    assistantLabel: "Claude (claude-haiku-4-5)",
    results: [
      {
        status: "checked",
        query: "best bakery in Halifax",
        named: true,
        position: 2,
        competitorsNamed: ["Copper Kettle Cafe"],
        answerExcerpt: "Northline Bakery is also well reviewed for sourdough.",
      },
      {
        status: "not_checked",
        query: "affordable bakery in Halifax",
        reason: "model_unavailable",
        detail: "Error: 529 overloaded",
      },
    ],
    checked: 1,
    notChecked: 1,
    named: 1,
    ...overrides,
  };
}

function entry(overrides: Partial<AuditLog> = {}): AuditLog {
  const built = buildAeoRunAuditEntry({
    id: "audit_1",
    workspaceId: "ws_1",
    actor: "Sam Owner",
    record: record(),
  });
  return { ...built, ...overrides };
}

describe("AEO run persistence", () => {
  it("round-trips a run through an audit entry without changing any verdict", () => {
    const stored = entry();
    expect(stored.action).toBe(AEO_RUN_ACTION);
    expect(stored.workspaceId).toBe("ws_1");

    const decoded = decodeAeoRun(stored.meta?.run);
    expect(decoded).not.toBeNull();
    expect(decoded?.checked).toBe(1);
    expect(decoded?.notChecked).toBe(1);
    expect(decoded?.named).toBe(1);
    expect(decoded?.results[1]).toEqual({
      status: "not_checked",
      query: "affordable bakery in Halifax",
      reason: "model_unavailable",
      detail: "Error: 529 overloaded",
    });
  });

  it("keeps the audit table's own columns free of the payload", () => {
    const stored = entry();
    expect(stored.targetId).toBe("aeo_1");
    expect(stored.targetType).toBe("aeo_snapshot");
    expect(stored.actor).toBe("Sam Owner");
  });

  it("returns the newest decodable run", () => {
    const older = entry({ id: "audit_0", at: "2026-01-01T00:00:00.000Z" });
    const newer = buildAeoRunAuditEntry({
      id: "audit_2",
      workspaceId: "ws_1",
      actor: "Sam Owner",
      record: record({ runId: "aeo_2", ranAt: "2026-04-01T00:00:00.000Z" }),
    });
    expect(latestAeoRun([older, newer])?.runId).toBe("aeo_2");
    expect(latestAeoRun([])).toBeNull();
  });

  it("skips a corrupted record rather than rendering a bogus verdict", () => {
    const corrupt: AuditLog = { ...entry({ id: "audit_bad" }), at: "2026-05-01T00:00:00.000Z" };
    corrupt.meta = { ...corrupt.meta, run: "{not json" };
    const good = entry({ id: "audit_good", at: "2026-02-01T00:00:00.000Z" });
    expect(latestAeoRun([corrupt, good])?.runId).toBe("aeo_1");
  });

  it("rejects stored outcomes with an unknown status or reason", () => {
    expect(decodeAeoRun({ ...record(), schemaVersion: 2 })).toBeNull();
    const withJunk = decodeAeoRun({
      ...record(),
      results: [
        { status: "guessed", query: "q", named: true },
        { status: "not_checked", query: "q2", reason: "made_up_reason", detail: "" },
        { status: "checked", query: "q3", named: "yes" },
      ],
    });
    expect(withJunk?.results).toEqual([]);
    expect(withJunk?.checked).toBe(0);
  });

  it("clears a position that survived on a not-named result", () => {
    const decoded = decodeAeoRun({
      ...record(),
      results: [
        { status: "checked", query: "q", named: false, position: 3, competitorsNamed: [], answerExcerpt: "x" },
      ],
    });
    expect(decoded?.results[0]).toMatchObject({ named: false, position: null });
  });

  it("bounds an oversized run before storing it", () => {
    const huge = record({
      results: Array.from({ length: 40 }, (_, index) => ({
        status: "checked" as const,
        query: `question ${index}`,
        named: true,
        position: 1,
        competitorsNamed: Array.from({ length: 30 }, (_, k) => `Rival ${k}`),
        answerExcerpt: "x".repeat(5_000),
      })),
    });
    const stored = buildAeoRunAuditEntry({ id: "a", workspaceId: "ws_1", actor: "Sam", record: huge });
    const run = String(stored.meta?.run ?? "");
    expect(run.length).toBeLessThanOrEqual(24_000);
    const decoded = decodeAeoRun(run);
    expect(decoded?.results).toHaveLength(8);
    expect(decoded?.results[0]).toMatchObject({ status: "checked" });
  });
});

describe("AEO metering", () => {
  const now = new Date("2026-03-04T10:00:00.000Z");

  it("counts only this month's runs from the workspace's own audit log", () => {
    const entries: AuditLog[] = [
      entry({ id: "a1", at: "2026-03-01T00:00:00.000Z" }),
      entry({ id: "a2", at: "2026-03-20T00:00:00.000Z" }),
      entry({ id: "a3", at: "2026-02-20T00:00:00.000Z" }),
      { ...entry({ id: "a4", at: "2026-03-21T00:00:00.000Z" }), action: "profile.change_approved" },
    ];
    expect(countRunsInMonth(entries, "2026-03")).toBe(2);

    const quota = aeoQuota(entries, "pro", now);
    expect(quota.used).toBe(2);
    expect(quota.limit).toBe(4);
    expect(quota.remaining).toBe(2);
    expect(quota.resetsOn.slice(0, 10)).toBe("2026-04-01");
  });

  it("never reports negative headroom once the limit is passed", () => {
    const entries = Array.from({ length: 9 }, (_, index) =>
      entry({ id: `a${index}`, at: "2026-03-02T00:00:00.000Z" }),
    );
    expect(aeoQuota(entries, "pro", now).remaining).toBe(0);
  });

  it("gives multi-location and agency plans a higher ceiling", () => {
    expect(monthlyRunLimit("pro")).toBe(4);
    expect(monthlyRunLimit("multi")).toBe(12);
    expect(monthlyRunLimit("agency")).toBe(12);
  });
});

describe("AEO view model", () => {
  it("prefers a fresh run over an older stored snapshot", () => {
    const snapshot = {
      locationId: "loc_1",
      date: "2026-01-01",
      namedFraction: { named: 6, total: 10 },
      queries: [],
    };
    expect(resolveAeoView(record(), snapshot)?.source).toBe("run");
    expect(resolveAeoView(null, snapshot)?.source).toBe("snapshot");
    expect(resolveAeoView(null, undefined)).toBeNull();
  });

  it("treats an empty snapshot as no snapshot at all", () => {
    expect(
      viewFromSnapshot({
        locationId: "loc_1",
        date: "2026-01-01",
        namedFraction: { named: 0, total: 0 },
        queries: [],
      }),
    ).toBeNull();
  });

  it("uses the checked count as the headline denominator", () => {
    const view = resolveAeoView(record(), undefined);
    expect(view?.headline).toEqual({ named: 1, checked: 1 });
    expect(view?.notChecked).toBe(1);
  });
});
