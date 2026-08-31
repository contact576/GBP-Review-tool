import { describe, expect, it, vi } from "vitest";
import { runAeoCheck, type AeoAskResult, type AeoModelClient } from "../runner";
import type { AeoBusinessContext, AeoCheckedQuery, AeoNotCheckedQuery } from "../types";

const CONTEXT: AeoBusinessContext = {
  locationId: "loc_1",
  businessName: "Northline Bakery",
  city: "Halifax",
  category: "bakery",
  services: ["sourdough", "wedding cakes"],
  servicesSource: "google_profile",
};

/** A stub model client. No network is ever touched in these tests. */
function stubClient(replies: AeoAskResult[]): AeoModelClient & { calls: string[] } {
  const calls: string[] = [];
  let index = 0;
  return {
    calls,
    provider: "stub",
    model: "stub-model-1",
    label: "Stub (stub-model-1)",
    async ask({ user }) {
      calls.push(user);
      const reply = replies[Math.min(index, replies.length - 1)];
      index += 1;
      return reply ?? { ok: false, reason: "model_unavailable", detail: "no stub reply" };
    },
  };
}

function answer(text: string, names: string[]): AeoAskResult {
  return { ok: true, payload: { answer: text, businessesNamed: names } };
}

function checked(outcome: AeoCheckedQuery | AeoNotCheckedQuery | undefined): AeoCheckedQuery {
  if (!outcome || outcome.status !== "checked") throw new Error("expected a checked outcome");
  return outcome;
}

function notChecked(outcome: AeoCheckedQuery | AeoNotCheckedQuery | undefined): AeoNotCheckedQuery {
  if (!outcome || outcome.status !== "not_checked") throw new Error("expected a not_checked outcome");
  return outcome;
}

describe("AEO runner — no API key", () => {
  it("reports every query as not checked, never as not named", async () => {
    const run = await runAeoCheck({
      context: CONTEXT,
      queries: ["best bakery in Halifax", "where can I get sourdough in Halifax"],
      client: null,
      runId: "aeo_test",
    });

    expect(run.checked).toBe(0);
    expect(run.notChecked).toBe(2);
    expect(run.named).toBe(0);
    for (const result of run.results) {
      expect(result.status).toBe("not_checked");
      expect(notChecked(result).reason).toBe("no_api_key");
      // The legacy `named` field must not exist on an unchecked outcome at all.
      expect(result).not.toHaveProperty("named");
    }
    expect(run.provider).toBe("none");
    expect(run.assistantLabel).toBe("No assistant configured");
  });
});

describe("AEO runner — verdicts derived from the answer text", () => {
  it("names the business, positions it and verifies competitors", async () => {
    const client = stubClient([
      answer(
        "For bakeries in Halifax, Copper Kettle Cafe is a local favourite. Northline Bakery is also well reviewed for sourdough. Bright Street Bread rounds out the list.",
        ["Copper Kettle Cafe", "Northline Bakery", "Bright Street Bread"],
      ),
    ]);

    const run = await runAeoCheck({
      context: CONTEXT,
      queries: ["best bakery in Halifax"],
      client,
      runId: "aeo_test",
    });

    const result = checked(run.results[0]);
    expect(result.named).toBe(true);
    expect(result.position).toBe(2);
    expect(result.competitorsNamed).toEqual(["Copper Kettle Cafe", "Bright Street Bread"]);
    expect(run.named).toBe(1);
    expect(run.checked).toBe(1);
  });

  it("returns an excerpt that is the model's actual words", async () => {
    const text =
      "For bakeries in Halifax, Copper Kettle Cafe is a local favourite. Northline Bakery is also well reviewed for sourdough.";
    const client = stubClient([answer(text, ["Copper Kettle Cafe", "Northline Bakery"])]);

    const run = await runAeoCheck({
      context: CONTEXT,
      queries: ["best bakery in Halifax"],
      client,
      runId: "aeo_test",
    });

    const result = checked(run.results[0]);
    expect(text).toContain(result.answerExcerpt.replace(/…$/, ""));
    expect(result.answerExcerpt).toContain("Northline Bakery");
  });

  it("records a genuine 'not named' when the answer really omits the business", async () => {
    const client = stubClient([
      answer(
        "In Halifax, Copper Kettle Cafe and Bright Street Bread are the two most frequently recommended bakeries.",
        ["Copper Kettle Cafe", "Bright Street Bread"],
      ),
    ]);

    const run = await runAeoCheck({
      context: CONTEXT,
      queries: ["best bakery in Halifax"],
      client,
      runId: "aeo_test",
    });

    const result = checked(run.results[0]);
    expect(result.named).toBe(false);
    expect(result.position).toBeNull();
    expect(result.competitorsNamed).toEqual(["Copper Kettle Cafe", "Bright Street Bread"]);
  });

  it("drops competitor names the model reported but never wrote", async () => {
    const client = stubClient([
      answer("In Halifax, Copper Kettle Cafe is the most frequently recommended bakery for sourdough.", [
        "Copper Kettle Cafe",
        "Totally Invented Bakehouse",
      ]),
    ]);

    const run = await runAeoCheck({
      context: CONTEXT,
      queries: ["best bakery in Halifax"],
      client,
      runId: "aeo_test",
    });

    expect(checked(run.results[0]).competitorsNamed).toEqual(["Copper Kettle Cafe"]);
  });

  it("still counts a mention the model forgot to report", async () => {
    const client = stubClient([
      answer("Northline Bakery is the one I would start with for sourdough in Halifax.", []),
    ]);

    const run = await runAeoCheck({
      context: CONTEXT,
      queries: ["where can I get sourdough in Halifax"],
      client,
      runId: "aeo_test",
    });

    const result = checked(run.results[0]);
    expect(result.named).toBe(true);
    expect(result.position).toBe(1);
  });

  it("does not score a generic name from generic words in the answer", async () => {
    const generic: AeoBusinessContext = { ...CONTEXT, businessName: "Halifax Bakery" };
    const client = stubClient([
      answer("There are many good options if you want a bakery in Halifax — try Copper Kettle Cafe.", [
        "Copper Kettle Cafe",
      ]),
    ]);

    const run = await runAeoCheck({
      context: generic,
      queries: ["best bakery in Halifax"],
      client,
      runId: "aeo_test",
    });

    expect(checked(run.results[0]).named).toBe(false);
  });
});

describe("AEO runner — malformed, refused and failing replies are never a verdict", () => {
  it("treats a malformed payload as not checked", async () => {
    const client = stubClient([{ ok: true, payload: { nope: true } }]);
    const run = await runAeoCheck({
      context: CONTEXT,
      queries: ["best bakery in Halifax"],
      client,
      runId: "aeo_test",
    });

    const result = notChecked(run.results[0]);
    expect(result.reason).toBe("invalid_output");
    expect(result.detail).toMatch(/answer text/i);
    expect(run.named).toBe(0);
    expect(run.checked).toBe(0);
  });

  it("treats non-JSON garbage as not checked", async () => {
    const client = stubClient([{ ok: true, payload: "I'm just going to write prose instead" }]);
    const run = await runAeoCheck({
      context: CONTEXT,
      queries: ["best bakery in Halifax"],
      client,
      runId: "aeo_test",
    });
    expect(notChecked(run.results[0]).reason).toBe("invalid_output");
  });

  it("treats a refusal as not checked rather than not named", async () => {
    const client = stubClient([
      answer("I'm sorry, but I can't recommend specific businesses in that area.", []),
    ]);
    const run = await runAeoCheck({
      context: CONTEXT,
      queries: ["best bakery in Halifax"],
      client,
      runId: "aeo_test",
    });

    expect(notChecked(run.results[0]).reason).toBe("refused");
    expect(run.checked).toBe(0);
  });

  it("treats a transport failure as not checked", async () => {
    const client = stubClient([
      { ok: false, reason: "model_unavailable", detail: "Error: 529 overloaded" },
    ]);
    const run = await runAeoCheck({
      context: CONTEXT,
      queries: ["best bakery in Halifax"],
      client,
      runId: "aeo_test",
    });

    const result = notChecked(run.results[0]);
    expect(result.reason).toBe("model_unavailable");
    expect(result.detail).toContain("529");
  });

  it("treats a client that throws as not checked", async () => {
    const client: AeoModelClient = {
      provider: "stub",
      model: "stub-model-1",
      label: "Stub",
      ask: vi.fn().mockRejectedValue(new Error("socket hang up")),
    };
    const run = await runAeoCheck({
      context: CONTEXT,
      queries: ["best bakery in Halifax"],
      client,
      runId: "aeo_test",
    });

    const result = notChecked(run.results[0]);
    expect(result.reason).toBe("model_unavailable");
    expect(result.detail).toContain("socket hang up");
  });

  it("keeps checked and unchecked queries in the same run without contaminating the fraction", async () => {
    const client = stubClient([
      answer("Northline Bakery is the standout bakery in Halifax right now.", ["Northline Bakery"]),
      { ok: false, reason: "model_unavailable", detail: "timeout" },
    ]);

    const run = await runAeoCheck({
      context: CONTEXT,
      queries: ["best bakery in Halifax", "where can I get wedding cakes in Halifax"],
      client,
      runId: "aeo_test",
      concurrency: 1,
    });

    expect(run.checked).toBe(1);
    expect(run.notChecked).toBe(1);
    // Named-in-1-of-1-checked, not 1-of-2-asked.
    expect(run.named).toBe(1);
  });
});

describe("AEO runner — mechanics", () => {
  it("de-duplicates queries and preserves order under concurrency", async () => {
    const client = stubClient([answer("Copper Kettle Cafe is a good pick in Halifax.", ["Copper Kettle Cafe"])]);
    const run = await runAeoCheck({
      context: CONTEXT,
      queries: ["best bakery in Halifax", "Best Bakery In Halifax", "sourdough in Halifax", "  "],
      client,
      runId: "aeo_test",
      concurrency: 3,
    });

    expect(run.results.map((result) => result.query)).toEqual([
      "best bakery in Halifax",
      "sourdough in Halifax",
    ]);
    expect(client.calls).toHaveLength(2);
  });

  it("stamps the run with the assistant that actually answered", async () => {
    const client = stubClient([answer("Copper Kettle Cafe is a good pick in Halifax.", [])]);
    const run = await runAeoCheck({
      context: CONTEXT,
      queries: ["best bakery in Halifax"],
      client,
      runId: "aeo_run_1",
      now: new Date("2026-03-04T10:00:00.000Z"),
    });

    expect(run.runId).toBe("aeo_run_1");
    expect(run.ranAt).toBe("2026-03-04T10:00:00.000Z");
    expect(run.provider).toBe("stub");
    expect(run.model).toBe("stub-model-1");
    expect(run.assistantLabel).toBe("Stub (stub-model-1)");
  });
});
