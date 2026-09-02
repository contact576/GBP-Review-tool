import { describe, it, expect } from "vitest";
import { aggregateMultiRun, shareOfVoice } from "@/lib/aeo/multi";
import type { AeoQueryOutcome, AeoRunRecord } from "@/lib/aeo/types";
import type { AeoEngineId } from "@/lib/aeo/engines";

const YOU = "Copper Kettle Cafe";
const Q1 = "best cafe in Halifax";
const Q2 = "where can I get espresso in Halifax";
const Q3 = "cafe in Halifax open on the weekend";

function checked(query: string, named: boolean, position: number | null, competitors: string[] = []): AeoQueryOutcome {
  return { status: "checked", query, named, position, competitorsNamed: competitors, answerExcerpt: "…" };
}

function notChecked(query: string, reason: "model_unavailable" | "refused" = "model_unavailable"): AeoQueryOutcome {
  return { status: "not_checked", query, reason, detail: "engine down" };
}

function record(engine: string, results: AeoQueryOutcome[]): AeoRunRecord {
  const done = results.filter((r) => r.status === "checked");
  return {
    schemaVersion: 1,
    runId: "run_1",
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

function run(engines: Parameters<typeof aggregateMultiRun>[0]["engines"]) {
  return aggregateMultiRun({
    runId: "run_1",
    ranAt: "2026-07-20T12:00:00.000Z",
    queries: [Q1, Q2, Q3],
    context: { businessName: YOU },
    engines,
  });
}

describe("aggregateMultiRun — engines", () => {
  it("reports an unconnected engine as not connected, with what is missing, and never scores it", () => {
    const result = run([
      { engineId: "openai", record: null },
      { engineId: "perplexity", record: record("perplexity", [checked(Q1, true, 1), checked(Q2, false, null), checked(Q3, true, 2)]) },
    ]);
    const openai = result.engines.find((e) => e.engineId === "openai")!;
    expect(openai.state).toBe("not_connected");
    expect(openai.missing).toBe("OPENAI_API_KEY is not set");
    expect(openai.metrics).toBeNull();
    expect(openai.model).toBeNull();

    // Only the connected engine reaches the denominator.
    expect(result.summary.enginesConnected).toBe(1);
    expect(result.summary.enginesTotal).toBe(2);
    expect(result.summary.answersChecked).toBe(3);
    expect(result.summary.answersNamed).toBe(2);
  });

  it("computes per-engine presence and position from checked answers only", () => {
    const result = run([
      { engineId: "openai", record: record("openai", [checked(Q1, true, 3), notChecked(Q2), checked(Q3, true, 1)]) },
    ]);
    const openai = result.engines[0]!;
    expect(openai.metrics).toEqual({
      asked: 3,
      checked: 2,
      named: 2,
      presenceRate: 1,
      averagePosition: 2,
      bestPosition: 1,
    });
  });

  it("uses null, not 0, when an engine checked nothing", () => {
    const result = run([
      { engineId: "google", record: record("google", [notChecked(Q1), notChecked(Q2), notChecked(Q3)]) },
    ]);
    expect(result.engines[0]!.metrics!.presenceRate).toBeNull();
    expect(result.engines[0]!.metrics!.averagePosition).toBeNull();
    expect(result.summary.presenceRate).toBeNull();
    expect(result.summary.questionsChecked).toBe(0);
  });

  it("carries the engine's model and grounding into the outcome", () => {
    const result = run([{ engineId: "perplexity", record: record("perplexity", [checked(Q1, true, 1)]) }]);
    expect(result.engines[0]!.model).toBe("perplexity-model");
    expect(result.engines[0]!.grounding).toBe("web_search");
    expect(result.engines[0]!.productName).toBe("Perplexity");
  });
});

describe("aggregateMultiRun — matrix", () => {
  it("builds one cell per engine per question with the honest state", () => {
    const result = run([
      { engineId: "openai", record: record("openai", [checked(Q1, true, 2), checked(Q2, false, null), notChecked(Q3, "refused")]) },
      { engineId: "anthropic", record: null },
    ]);
    const row1 = result.matrix[0]!;
    expect(row1.query).toBe(Q1);
    expect(row1.cells.map((c) => c.state)).toEqual(["named", "not_connected"]);
    expect(row1.cells[0]!.position).toBe(2);
    expect(row1.namedOn).toBe(1);
    expect(row1.checkedOn).toBe(1);
    expect(row1.bestPosition).toBe(2);

    const row2 = result.matrix[1]!;
    expect(row2.cells[0]!.state).toBe("not_named");
    expect(row2.namedOn).toBe(0);
    expect(row2.checkedOn).toBe(1);
    expect(row2.bestPosition).toBeNull();

    const row3 = result.matrix[2]!;
    expect(row3.cells[0]!.state).toBe("not_checked");
    expect(row3.cells[0]!.note).toBe("engine down");
    expect(row3.checkedOn).toBe(0);
  });

  it("treats a question missing from an engine's results as not checked, never as absent", () => {
    const result = run([{ engineId: "openai", record: record("openai", [checked(Q1, true, 1)]) }]);
    expect(result.matrix[1]!.cells[0]!.state).toBe("not_checked");
    expect(result.matrix[2]!.cells[0]!.state).toBe("not_checked");
  });

  it("counts consensus across engines per question", () => {
    const result = run([
      { engineId: "openai", record: record("openai", [checked(Q1, true, 1), checked(Q2, false, null), checked(Q3, true, 1)]) },
      { engineId: "perplexity", record: record("perplexity", [checked(Q1, true, 2), checked(Q2, true, 1), notChecked(Q3)]) },
    ]);
    expect(result.summary.questionsChecked).toBe(3);
    // Q1 named by both, Q2 by one, Q3 by the only engine that answered it.
    expect(result.summary.questionsNamedOnAny).toBe(3);
    expect(result.summary.questionsNamedOnAll).toBe(2);
    expect(result.summary.answersChecked).toBe(5);
    expect(result.summary.answersNamed).toBe(4);
    expect(result.summary.presenceRate).toBeCloseTo(0.8);
    expect(result.summary.averagePosition).toBeCloseTo((1 + 1 + 2 + 1) / 4);
  });
});

describe("shareOfVoice", () => {
  it("ranks the business among the rivals the answers named, once per answer", () => {
    const result = run([
      {
        engineId: "openai",
        record: record("openai", [
          checked(Q1, true, 2, ["Northline Bakery"]),
          checked(Q2, false, null, ["Northline Bakery", "Seaside Roasters"]),
          checked(Q3, true, 1, []),
        ]),
      },
      {
        engineId: "perplexity",
        record: record("perplexity", [
          checked(Q1, false, null, ["Northline Bakery"]),
          checked(Q2, false, null, ["Seaside Roasters"]),
          checked(Q3, true, 1, ["Northline Bakery"]),
        ]),
      },
    ]);
    const names = result.shareOfVoice.map((s) => `${s.name}:${s.answers}`);
    expect(names).toEqual(["Northline Bakery:4", "Copper Kettle Cafe:3", "Seaside Roasters:2"]);
    const you = result.shareOfVoice.find((s) => s.isYou)!;
    expect(you.share).toBeCloseTo(3 / 6);
    expect(you.engines.sort()).toEqual(["openai", "perplexity"]);
    const rival = result.shareOfVoice[0]!;
    expect(rival.isYou).toBe(false);
    expect(rival.engines.sort()).toEqual(["openai", "perplexity"]);
  });

  it("merges the same rival written two ways", () => {
    const engines = run([
      {
        engineId: "openai",
        record: record("openai", [
          checked(Q1, false, null, ["Northline Bakery"]),
          checked(Q2, false, null, ["Northline Bakery & Cafe"]),
        ]),
      },
    ]).engines;
    const shares = shareOfVoice(engines, { businessName: YOU }, 2);
    expect(shares).toHaveLength(1);
    expect(shares[0]!.answers).toBe(2);
  });

  it("reports null share when nothing was checked, rather than dividing by zero", () => {
    const engines = run([{ engineId: "openai", record: record("openai", [notChecked(Q1)]) }]).engines;
    expect(shareOfVoice(engines, { businessName: YOU }, 0)).toEqual([]);
  });

  it("does not list the business when no answer named it", () => {
    const result = run([
      { engineId: "openai", record: record("openai", [checked(Q1, false, null, ["Northline Bakery"])]) },
    ]);
    expect(result.shareOfVoice.some((s) => s.isYou)).toBe(false);
    expect(result.shareOfVoice[0]!.name).toBe("Northline Bakery");
  });
});

describe("aggregateMultiRun — shape", () => {
  it("records the exact question list and the engine order given", () => {
    const order: AeoEngineId[] = ["perplexity", "openai"];
    const result = run(order.map((engineId) => ({ engineId, record: null })));
    expect(result.queries).toEqual([Q1, Q2, Q3]);
    expect(result.engines.map((e) => e.engineId)).toEqual(order);
    expect(result.schemaVersion).toBe(2);
  });
});
