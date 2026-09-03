import { describe, expect, it } from "vitest";
import { DEMO_WORKSPACE_ID, memoryProvider } from "@/lib/data/memory-provider";
import type { AeoQueryResult, AeoSnapshot, AuditLog } from "@/lib/data/types";
import {
  AEO_RUN_ACTION,
  AEO_RUN_TARGET_TYPE,
  boundRunRecord,
  buildAeoRunAuditEntry,
  outcomeFromStored,
  outcomesFromSnapshot,
  toAeoSnapshot,
} from "../persistence";
import { aeoQuota, countRunsInMonth, monthlyRunLimit } from "../metering";
import { assistantLabelFor, providerDisplayName, viewFromSnapshot } from "../view";
import type { AeoRunRecord } from "../types";

const LOCATION = "loc_1";

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

describe("AEO snapshot mapping", () => {
  it("uses the checked count as the stored denominator, never the count asked", () => {
    const snapshot = toAeoSnapshot(record(), LOCATION);
    expect(snapshot.locationId).toBe(LOCATION);
    expect(snapshot.date).toBe("2026-03-04T10:00:00.000Z");
    // Two questions were asked, one produced a verdict. "1 of 1", not "1 of 2".
    expect(snapshot.queries).toHaveLength(2);
    expect(snapshot.namedFraction).toEqual({ named: 1, total: 1 });
  });

  it("stores a not-checked query as not_checked with its reason and no invented answer", () => {
    const stored = toAeoSnapshot(record(), LOCATION).queries[1];
    expect(stored).toEqual({
      query: "affordable bakery in Halifax",
      status: "not_checked",
      notCheckedReason: "model_unavailable",
      named: false,
      position: null,
      competitorsNamed: [],
      answerExcerpt: "",
    });
    // `named: false` is carried only because the field is not optional. It is
    // never the row's verdict: `status` says so, and the fraction excludes it.
    expect(stored?.status).toBe("not_checked");
  });

  it("records the provider and model so the claim stays attributable", () => {
    const snapshot = toAeoSnapshot(record(), LOCATION);
    expect(snapshot.provider).toBe("anthropic");
    expect(snapshot.model).toBe("claude-haiku-4-5");
  });

  it("clears a position that survived on a not-named result", () => {
    const snapshot = toAeoSnapshot(
      record({
        results: [
          {
            status: "checked",
            query: "q",
            named: false,
            position: 3,
            competitorsNamed: [],
            answerExcerpt: "x",
          },
        ],
      }),
      LOCATION,
    );
    expect(snapshot.queries[0]).toMatchObject({ named: false, position: null });
  });

  it("bounds an oversized run and recomputes the counters from what survived", () => {
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
    const bounded = boundRunRecord(huge);
    expect(bounded.results).toHaveLength(8);
    expect(bounded.checked).toBe(8);
    expect(bounded.named).toBe(8);

    const snapshot = toAeoSnapshot(huge, LOCATION);
    expect(snapshot.queries).toHaveLength(8);
    expect(snapshot.namedFraction).toEqual({ named: 8, total: 8 });
    expect(snapshot.queries[0]?.competitorsNamed).toHaveLength(6);
    expect(snapshot.queries[0]?.answerExcerpt.length).toBe(400);
  });
});

describe("AEO snapshot save → read round trip", () => {
  it("keeps a not-checked query not_checked, and never surfaces it as not named", async () => {
    await memoryProvider.saveAeoSnapshot(DEMO_WORKSPACE_ID, toAeoSnapshot(record(), LOCATION));
    const data = await memoryProvider.getData(DEMO_WORKSPACE_ID);
    const stored = data?.aeo;
    expect(stored).toBeDefined();

    // The durable row itself carries the distinction.
    expect(stored?.queries[1]).toMatchObject({
      status: "not_checked",
      notCheckedReason: "model_unavailable",
    });

    // And reading it back yields the not_checked arm of the union — not a
    // checked query whose verdict happens to be false.
    const view = viewFromSnapshot(stored);
    expect(view).not.toBeNull();
    const readBack = view?.results[1];
    expect(readBack?.status).toBe("not_checked");
    expect(readBack).toMatchObject({
      status: "not_checked",
      query: "affordable bakery in Halifax",
      reason: "model_unavailable",
    });
    expect(readBack).not.toHaveProperty("named");

    // Nothing anywhere in the read model presents this question as "not named".
    const notNamed = view?.results.filter(
      (result) => result.status === "checked" && !result.named,
    );
    expect(notNamed).toEqual([]);

    // The headline denominator counts the one question we actually checked.
    expect(view?.headline).toEqual({ named: 1, checked: 1 });
    expect(view?.notChecked).toBe(1);

    // And the attribution survived with it.
    expect(view?.provider).toBe("anthropic");
    expect(view?.model).toBe("claude-haiku-4-5");
    expect(view?.assistantLabel).toBe("Claude (claude-haiku-4-5)");
    expect(view?.ranAt).toBe("2026-03-04T10:00:00.000Z");
  });

  it("survives a run where every question failed, without inventing a score", async () => {
    const allFailed = record({
      results: [
        { status: "not_checked", query: "q one", reason: "refused", detail: "declined" },
        { status: "not_checked", query: "q two", reason: "empty_answer", detail: "" },
      ],
      checked: 0,
      notChecked: 2,
      named: 0,
    });
    await memoryProvider.saveAeoSnapshot(DEMO_WORKSPACE_ID, toAeoSnapshot(allFailed, LOCATION));
    const data = await memoryProvider.getData(DEMO_WORKSPACE_ID);

    const view = viewFromSnapshot(data?.aeo);
    expect(view?.headline).toEqual({ named: 0, checked: 0 });
    expect(view?.notChecked).toBe(2);
    expect(view?.results.every((result) => result.status === "not_checked")).toBe(true);
    // 0 of 0 — the page renders its "no verdicts" state rather than "0%" of a
    // fabricated denominator.
    expect(data?.aeo.namedFraction).toEqual({ named: 0, total: 0 });
  });
});

describe("reading an untrusted stored row", () => {
  it("treats a legacy row with no status as the real verdict it claimed to be", () => {
    const legacy: AeoQueryResult = {
      query: "physio near me",
      named: true,
      position: 2,
      competitorsNamed: ["Riverside Physio"],
      answerExcerpt: "Harbourview Physiotherapy…",
    };
    expect(outcomeFromStored(legacy)).toEqual({
      status: "checked",
      query: "physio near me",
      named: true,
      position: 2,
      competitorsNamed: ["Riverside Physio"],
      answerExcerpt: "Harbourview Physiotherapy…",
    });
  });

  it("reports an unrecognised status as unchecked rather than guessing a verdict", () => {
    const junk = { query: "q", named: true, status: "guessed" } as unknown as AeoQueryResult;
    expect(outcomeFromStored(junk)).toEqual({
      status: "not_checked",
      query: "q",
      reason: "unreadable_record",
      detail: "",
    });
  });

  it("reports a non-boolean verdict as unchecked", () => {
    const junk = { query: "q", named: "yes", status: "checked" } as unknown as AeoQueryResult;
    expect(outcomeFromStored(junk)).toMatchObject({
      status: "not_checked",
      reason: "unreadable_record",
    });
  });

  it("keeps an unknown not-checked reason unchecked", () => {
    const junk = {
      query: "q",
      named: false,
      status: "not_checked",
      notCheckedReason: "made_up_reason",
    } as unknown as AeoQueryResult;
    expect(outcomeFromStored(junk)).toMatchObject({
      status: "not_checked",
      reason: "unreadable_record",
    });
  });

  it("drops rows with no question text", () => {
    const snapshot = {
      locationId: LOCATION,
      date: "2026-03-04",
      namedFraction: { named: 0, total: 0 },
      queries: [{ query: "", named: true, position: null, competitorsNamed: [], answerExcerpt: "" }],
    } satisfies AeoSnapshot;
    expect(outcomesFromSnapshot(snapshot)).toEqual([]);
    expect(outcomesFromSnapshot(null)).toEqual([]);
  });
});

describe("AEO run audit trail", () => {
  it("records the run event with its own columns and scalar counters only", () => {
    const stored = entry();
    expect(stored.action).toBe(AEO_RUN_ACTION);
    expect(stored.targetType).toBe(AEO_RUN_TARGET_TYPE);
    expect(stored.targetId).toBe("aeo_1");
    expect(stored.workspaceId).toBe("ws_1");
    expect(stored.actor).toBe("Sam Owner");
    expect(stored.at).toBe("2026-03-04T10:00:00.000Z");
    expect(stored.meta).toEqual({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      checked: 1,
      notChecked: 1,
      named: 1,
    });
  });

  it("keeps the result payload out of the audit row entirely", () => {
    const stored = entry();
    const serialized = JSON.stringify(stored.meta ?? {});
    expect(serialized).not.toContain("best bakery in Halifax");
    expect(serialized).not.toContain("answerExcerpt");
    expect(stored.meta).not.toHaveProperty("run");
  });
});

describe("AEO metering", () => {
  const now = new Date("2026-03-04T10:00:00.000Z");

  // The quota is still counted from the workspace's own audit log — the run
  // event rows above — so swapping where the RESULTS live changed nothing here.
  it("counts only this month's runs from the workspace's own audit log", () => {
    const entries: AuditLog[] = [
      entry({ id: "a1", at: "2026-03-01T00:00:00.000Z" }),
      entry({ id: "a2", at: "2026-03-20T00:00:00.000Z" }),
      entry({ id: "a3", at: "2026-02-20T00:00:00.000Z" }),
      { ...entry({ id: "a4", at: "2026-03-21T00:00:00.000Z" }), action: "profile.change_approved" },
    ];
    expect(countRunsInMonth(entries, "2026-03")).toBe(2);

    const quota = aeoQuota(entries, "growth", now);
    expect(quota.used).toBe(2);
    expect(quota.limit).toBe(4);
    expect(quota.remaining).toBe(2);
    expect(quota.resetsOn.slice(0, 10)).toBe("2026-04-01");
  });

  it("never reports negative headroom once the limit is passed", () => {
    const entries = Array.from({ length: 9 }, (_, index) =>
      entry({ id: `a${index}`, at: "2026-03-02T00:00:00.000Z" }),
    );
    expect(aeoQuota(entries, "growth", now).remaining).toBe(0);
  });

  it("gives multi-location and agency plans a higher ceiling", () => {
    expect(monthlyRunLimit("growth")).toBe(4);
    expect(monthlyRunLimit("multi")).toBe(12);
    expect(monthlyRunLimit("agency")).toBe(12);
  });
});

describe("AEO view model", () => {
  it("treats an empty snapshot as no snapshot at all", () => {
    expect(
      viewFromSnapshot({
        locationId: LOCATION,
        date: "2026-01-01",
        namedFraction: { named: 0, total: 0 },
        queries: [],
      }),
    ).toBeNull();
    expect(viewFromSnapshot(undefined)).toBeNull();
  });

  it("keeps a legacy snapshot's own headline claim, which counted checked queries", () => {
    const view = viewFromSnapshot({
      locationId: LOCATION,
      date: "2026-01-01",
      namedFraction: { named: 6, total: 10 },
      queries: [
        { query: "a", named: true, position: 1, competitorsNamed: [], answerExcerpt: "…" },
      ],
    });
    expect(view?.headline).toEqual({ named: 6, checked: 10 });
    expect(view?.notChecked).toBe(0);
    expect(view?.assistantLabel).toBeNull();
    expect(view?.model).toBeNull();
  });

  it("recomputes the headline from the rows once a snapshot carries status", () => {
    const view = viewFromSnapshot({
      ...toAeoSnapshot(record(), LOCATION),
      // A stale fraction on a status-bearing snapshot must not win.
      namedFraction: { named: 9, total: 9 },
    });
    expect(view?.headline).toEqual({ named: 1, checked: 1 });
  });

  it("labels the assistant from the recorded provider and model", () => {
    expect(assistantLabelFor("anthropic", "claude-haiku-4-5")).toBe("Claude (claude-haiku-4-5)");
    expect(assistantLabelFor("openai", "gpt-5")).toBe("ChatGPT (gpt-5)");
    expect(assistantLabelFor("some-vendor", "m1")).toBe("some-vendor (m1)");
    expect(providerDisplayName("anthropic")).toBe("Claude");
    // A run with nothing configured records "none" — never labelled as a real
    // assistant.
    expect(assistantLabelFor("none", "none")).toBeNull();
    expect(assistantLabelFor(null, null)).toBeNull();
  });
});
