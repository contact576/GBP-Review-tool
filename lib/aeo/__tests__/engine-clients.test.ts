import { describe, it, expect } from "vitest";
import {
  describeHttpFailure,
  geminiBody,
  openAiStyleBody,
  parseGeminiResponse,
  parseOpenAiStyleResponse,
  stripCodeFence,
  toGeminiSchema,
} from "@/lib/aeo/engine-clients";
import { AEO_ANSWER_SCHEMA, AEO_TOOL_NAME } from "@/lib/aeo/schema";

const PAYLOAD = { answer: "Copper Kettle Cafe is a solid pick in Halifax.", businessesNamed: ["Copper Kettle Cafe"] };

describe("OpenAI-style wire format (OpenAI, Perplexity)", () => {
  it("asks for strict structured output against the shared schema", () => {
    const body = openAiStyleBody({
      model: "gpt-x",
      system: "SYS",
      user: "USER",
      schema: AEO_ANSWER_SCHEMA,
      maxTokens: 900,
      tokenLimitField: "max_completion_tokens",
    });
    expect(body.model).toBe("gpt-x");
    expect(body.max_completion_tokens).toBe(900);
    expect(body).not.toHaveProperty("max_tokens");
    expect(body.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "USER" },
    ]);
    const format = body.response_format as { type: string; json_schema: { name: string; strict: boolean; schema: unknown } };
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.name).toBe(AEO_TOOL_NAME);
    expect(format.json_schema.strict).toBe(true);
    expect(format.json_schema.schema).toBe(AEO_ANSWER_SCHEMA);
  });

  it("keeps the legacy max_tokens field for engines that still expect it", () => {
    const body = openAiStyleBody({
      model: "sonar",
      system: "SYS",
      user: "USER",
      schema: AEO_ANSWER_SCHEMA,
      maxTokens: 900,
      tokenLimitField: "max_tokens",
    });
    expect(body.max_tokens).toBe(900);
    expect(body).not.toHaveProperty("max_completion_tokens");
  });

  it("reads the payload out of the first choice", () => {
    const result = parseOpenAiStyleResponse({
      choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(PAYLOAD) } }],
    });
    expect(result).toEqual({ ok: true, payload: PAYLOAD });
  });

  it("reports a truncated answer as empty rather than parsing half an object", () => {
    const result = parseOpenAiStyleResponse({
      choices: [{ finish_reason: "length", message: { content: '{"answer": "Copper Ket' } }],
    });
    expect(result).toMatchObject({ ok: false, reason: "empty_answer" });
  });

  it("reports missing choices and unparseable content as invalid output", () => {
    expect(parseOpenAiStyleResponse({ choices: [] })).toMatchObject({ ok: false, reason: "invalid_output" });
    expect(
      parseOpenAiStyleResponse({ choices: [{ finish_reason: "stop", message: { content: "not json" } }] }),
    ).toMatchObject({ ok: false, reason: "invalid_output" });
  });

  it("reports empty content as an empty answer", () => {
    expect(parseOpenAiStyleResponse({ choices: [{ finish_reason: "stop", message: { content: "  " } }] })).toMatchObject({
      ok: false,
      reason: "empty_answer",
    });
  });

  it("tolerates a markdown fence around the JSON", () => {
    const fenced = "```json\n" + JSON.stringify(PAYLOAD) + "\n```";
    expect(parseOpenAiStyleResponse({ choices: [{ finish_reason: "stop", message: { content: fenced } }] })).toEqual({
      ok: true,
      payload: PAYLOAD,
    });
  });
});

describe("Gemini wire format", () => {
  it("translates the shared schema into Gemini's dialect without duplicating it", () => {
    const schema = toGeminiSchema(AEO_ANSWER_SCHEMA);
    expect(schema.type).toBe("OBJECT");
    expect("additionalProperties" in schema).toBe(false);
    const properties = schema.properties as Record<string, { type: string; items?: { type: string } }>;
    expect(properties.answer!.type).toBe("STRING");
    expect(properties.businessesNamed!.type).toBe("ARRAY");
    expect(properties.businessesNamed!.items!.type).toBe("STRING");
    expect(schema.required).toEqual(["answer", "businessesNamed"]);
  });

  it("sends the system prompt as a system instruction and asks for JSON", () => {
    const body = geminiBody({ system: "SYS", user: "USER", schema: AEO_ANSWER_SCHEMA, maxTokens: 900 });
    expect(body.system_instruction).toEqual({ parts: [{ text: "SYS" }] });
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "USER" }] }]);
    const config = body.generationConfig as Record<string, unknown>;
    expect(config.responseMimeType).toBe("application/json");
    expect(config.maxOutputTokens).toBe(900);
    expect((config.responseSchema as { type: string }).type).toBe("OBJECT");
  });

  it("reads the payload out of the first candidate's parts", () => {
    const result = parseGeminiResponse({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(PAYLOAD) }] } }],
    });
    expect(result).toEqual({ ok: true, payload: PAYLOAD });
  });

  it("reports a prompt block as a refusal, not a verdict", () => {
    expect(parseGeminiResponse({ promptFeedback: { blockReason: "SAFETY" } })).toMatchObject({
      ok: false,
      reason: "refused",
    });
    expect(
      parseGeminiResponse({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] }),
    ).toMatchObject({ ok: false, reason: "refused" });
  });

  it("reports truncation as an empty answer", () => {
    expect(
      parseGeminiResponse({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }] }),
    ).toMatchObject({ ok: false, reason: "empty_answer" });
  });

  it("reports no candidates as invalid output", () => {
    expect(parseGeminiResponse({})).toMatchObject({ ok: false, reason: "invalid_output" });
  });
});

describe("failure descriptions", () => {
  it("carries the engine's own error message with the status", () => {
    expect(describeHttpFailure(401, { error: { message: "Invalid API key" } })).toBe(
      "The engine refused the request (HTTP 401): Invalid API key",
    );
    expect(describeHttpFailure(500, null)).toBe("The engine refused the request (HTTP 500)");
  });

  it("strips a code fence and leaves bare JSON alone", () => {
    expect(stripCodeFence("```json\n{\"a\":1}\n```")).toBe('{"a":1}');
    expect(stripCodeFence('{"a":1}')).toBe('{"a":1}');
  });
});
