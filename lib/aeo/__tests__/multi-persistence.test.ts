import { describe, it, expect } from "vitest";
import { aggregateMultiRun } from "@/lib/aeo/multi";
import { buildMultiAeoRunAuditEntry, multiFromSnapshot, toMultiAeoSnapshot } from "@/lib/aeo/persistence";
import { buildSeed } from "@/lib/data/seed";
import type { AeoQueryOutcome, AeoRunRecord } from "@/lib/aeo/types";

const YOU = "Copper Kettle Cafe";
const Q1 = "best cafe in Halifax";
const Q2 = "where can I get espresso in Halifax";

function checked(query: string, named: boolean, position: number | null, competitors: string[] = []): AeoQueryOutcome {
  return { status: "checked", query, named, position, competitorsNamed: competitors, answerExcerpt: "the answer" };
}

function record(engine: string, results: AeoQueryOutcome[]): AeoRunRecord {
  const done = results.filter((r) => r.status === "checked");
  return {
    schemaVersion: 1,
    runId: `run_${engine}`,
    ranAt: "2026-07-20T12:00:00.000Z",
    provider: engine,
    model: `${engine}-model`,
    assistantLabel: engine,
    results,
    checked: done.length,
    notChecked: results.length - done.length,
    named: done.filter((r) => r.status === "checked" && r.named).length,
  };
}

const MULTI = aggregateMultiRun({
  runId: "run_1",
  ranAt: "2026-07-20T12:00:00.000Z",
  queries: [Q1, Q2],
  context: { businessName: YOU },
  engines: [
    { engineId: "openai", record: record("openai", [checked(Q1, true, 2, ["Northline Bakery"]), checked(Q2, false, null, ["Seaside Roasters"])]) },
    { engineId: "google", record: null },
    {
      engineId: "perplexity",
      record: record("perplexity", [
        checked(Q1, true, 1, []),
        { status: "not_checked", query: Q2, reason: "model_unavailable", detail: "timeout" },
      ]),
    },
  ],
});

describe("toMultiAeoSnapshot", () => {
  it("stores every engine, connected or not, and keeps the legacy fields on the first answering engine", () => {
    const snapshot = toMultiAeoSnapshot(MULTI, "loc_1");
    expect(snapshot.locationId).toBe("loc_1");
    expect(snapshot.date).toBe("2026-07-20T12:00:00.000Z");
    expect(snapshot.engines!.map((e) => `${e.engineId}:${e.state}`)).toEqual([
      "openai:answered",
      "google:not_connected",
      "perplexity:answered",
    ]);
    expect(snapshot.engines![1]!.missing).toBe("GOOGLE_AI_API_KEY is not set");
    expect(snapshot.engines![1]!.queries).toEqual([]);
    expect(snapshot.engines![1]!.model).toBeNull();

    // Legacy readers see one attributable assistant: the first that answered.
    expect(snapshot.provider).toBe("openai");
    expect(snapshot.model).toBe("openai-model");
    expect(snapshot.namedFraction).toEqual({ named: 1, total: 2 });
    expect(snapshot.queries).toHaveLength(2);
  });

  it("stores a not-checked row without inventing verdict content", () => {
    const snapshot = toMultiAeoSnapshot(MULTI, "loc_1");
    const perplexity = snapshot.engines!.find((e) => e.engineId === "perplexity")!;
    const row = perplexity.queries.find((q) => q.query === Q2)!;
    expect(row.status).toBe("not_checked");
    expect(row.notCheckedReason).toBe("model_unavailable");
    expect(row.named).toBe(false);
    expect(row.position).toBeNull();
    expect(row.answerExcerpt).toBe("");
  });

  it("says zero over zero and provider none when no engine answered", () => {
    const none = aggregateMultiRun({
      runId: "run_2",
      ranAt: "2026-07-20T12:00:00.000Z",
      queries: [Q1],
      context: { businessName: YOU },
      engines: [{ engineId: "openai", record: null }],
    });
    const snapshot = toMultiAeoSnapshot(none, "loc_1");
    expect(snapshot.namedFraction).toEqual({ named: 0, total: 0 });
    expect(snapshot.provider).toBe("none");
    expect(snapshot.queries).toEqual([]);
    expect(snapshot.engines).toHaveLength(1);
  });
});

describe("multiFromSnapshot", () => {
  it("round-trips a run through storage with the same grid, summary and share of voice", () => {
    const snapshot = toMultiAeoSnapshot(MULTI, "loc_1");
    const back = multiFromSnapshot(snapshot, { businessName: YOU })!;
    expect(back).not.toBeNull();
    expect(back.queries).toEqual([Q1, Q2]);
    expect(back.engines.map((e) => e.state)).toEqual(MULTI.engines.map((e) => e.state));
    expect(back.matrix.map((row) => row.cells.map((c) => c.state))).toEqual(
      MULTI.matrix.map((row) => row.cells.map((c) => c.state)),
    );
    expect(back.summary).toEqual(MULTI.summary);
    expect(back.shareOfVoice.map((s) => `${s.name}:${s.answers}`)).toEqual(
      MULTI.shareOfVoice.map((s) => `${s.name}:${s.answers}`),
    );
    expect(back.engines[2]!.model).toBe("perplexity-model");
  });

  it("returns null for a snapshot that predates engines", () => {
    const snapshot = toMultiAeoSnapshot(MULTI, "loc_1");
    delete snapshot.engines;
    expect(multiFromSnapshot(snapshot, { businessName: YOU })).toBeNull();
    expect(multiFromSnapshot(null, { businessName: YOU })).toBeNull();
  });

  it("drops an engine id this version does not know rather than rendering an unexplained column", () => {
    const snapshot = toMultiAeoSnapshot(MULTI, "loc_1");
    snapshot.engines!.push({
      engineId: "mystery",
      productName: "Mystery",
      vendor: "?",
      grounding: "model_knowledge",
      model: "m",
      state: "answered",
      missing: null,
      queries: [],
    });
    const back = multiFromSnapshot(snapshot, { businessName: YOU })!;
    expect(back.engines.map((e) => e.engineId)).toEqual(["openai", "google", "perplexity"]);
  });

  it("reads the seeded demo workspace as a four-engine run with one engine not connected", () => {
    const seed = buildSeed();
    const back = multiFromSnapshot(seed.aeo, { businessName: seed.location.name })!;
    expect(back).not.toBeNull();
    expect(back.summary.enginesTotal).toBe(4);
    expect(back.summary.enginesConnected).toBe(3);
    expect(back.queries).toHaveLength(6);
    // The demo's numbers come from its stored rows, never from a placeholder.
    expect(back.summary.answersChecked).toBe(17);
    expect(back.summary.answersNamed).toBe(12);
    expect(back.shareOfVoice[0]!.isYou).toBe(true);
  });
});

describe("buildMultiAeoRunAuditEntry", () => {
  it("records one run event naming the engines that answered", () => {
    const entry = buildMultiAeoRunAuditEntry({ id: "audit_1", workspaceId: "ws_1", actor: "Alex", multi: MULTI });
    expect(entry.action).toBe("aeo.check_run");
    expect(entry.targetId).toBe("run_1");
    expect(entry.at).toBe("2026-07-20T12:00:00.000Z");
    expect(entry.meta).toMatchObject({
      engines: "openai:openai-model,perplexity:perplexity-model",
      enginesConnected: 2,
      enginesTotal: 3,
      answersChecked: 3,
      answersNamed: 2,
      questions: 2,
    });
  });
});
