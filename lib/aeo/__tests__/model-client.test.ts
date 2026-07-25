import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Anthropic-backed client, exercised entirely against a mocked SDK factory.
 * No real network call is ever made from this suite.
 */
const create = vi.fn();

vi.mock("@/lib/ai/client", () => ({
  getAnthropic: () => (process.env.ANTHROPIC_API_KEY ? { messages: { create } } : null),
}));

import { getAeoModelClient } from "../model-client";
import { AEO_ANSWER_SCHEMA } from "../schema";
import { runAeoCheck } from "../runner";
import type { AeoBusinessContext } from "../types";

const CONTEXT: AeoBusinessContext = {
  locationId: "loc_1",
  businessName: "Northline Bakery",
  city: "Halifax",
  category: "bakery",
  services: [],
  servicesSource: "none",
};

const originalKey = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  create.mockReset();
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
});

describe("AEO model client — no API key configured", () => {
  it("returns null so the runner can report 'not checked'", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(getAeoModelClient()).toBeNull();

    const run = await runAeoCheck({
      context: CONTEXT,
      queries: ["best bakery in Halifax"],
      client: getAeoModelClient(),
      runId: "aeo_test",
    });
    expect(run.results[0]).toMatchObject({ status: "not_checked", reason: "no_api_key" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("AEO model client — configured", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-test-not-a-real-key";
  });

  it("forces the structured tool call and returns its input", async () => {
    create.mockResolvedValue({
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", name: "record_assistant_answer", input: { answer: "a", businessesNamed: [] } },
      ],
    });

    const client = getAeoModelClient();
    expect(client).not.toBeNull();
    const result = await client!.ask({
      system: "sys",
      user: "usr",
      schema: AEO_ANSWER_SCHEMA,
      maxTokens: 900,
    });

    expect(result).toEqual({ ok: true, payload: { answer: "a", businessesNamed: [] } });
    const args = create.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.tool_choice).toEqual({ type: "tool", name: "record_assistant_answer" });
    expect(args.max_tokens).toBe(900);
  });

  it("reports a truncated reply as not checked, not as an empty answer", async () => {
    create.mockResolvedValue({ stop_reason: "max_tokens", content: [{ type: "text", text: "…" }] });
    const result = await getAeoModelClient()!.ask({
      system: "sys",
      user: "usr",
      schema: AEO_ANSWER_SCHEMA,
      maxTokens: 20,
    });
    expect(result).toMatchObject({ ok: false, reason: "empty_answer" });
  });

  it("turns an API error into a reason, never a verdict", async () => {
    create.mockRejectedValue(new Error("529 overloaded_error"));
    const result = await getAeoModelClient()!.ask({
      system: "sys",
      user: "usr",
      schema: AEO_ANSWER_SCHEMA,
      maxTokens: 900,
    });
    expect(result).toMatchObject({ ok: false, reason: "model_unavailable" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toContain("529");
  });

  it("drives an end-to-end run through the mocked SDK with no network", async () => {
    create.mockResolvedValue({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          name: "record_assistant_answer",
          input: {
            answer: "Northline Bakery and Copper Kettle Cafe are the two best-reviewed bakeries in Halifax.",
            businessesNamed: ["Northline Bakery", "Copper Kettle Cafe"],
          },
        },
      ],
    });

    const run = await runAeoCheck({
      context: CONTEXT,
      queries: ["best bakery in Halifax"],
      client: getAeoModelClient(),
      runId: "aeo_test",
    });

    expect(run.provider).toBe("anthropic");
    expect(run.results[0]).toMatchObject({
      status: "checked",
      named: true,
      position: 1,
      competitorsNamed: ["Copper Kettle Cafe"],
    });
  });
});
