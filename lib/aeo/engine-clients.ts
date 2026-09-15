import "server-only";
import { AEO_ENGINES, engineModel, type AeoEngineId } from "./engines";
import { AEO_TOOL_NAME, type AeoJsonSchema } from "./schema";
import type { AeoAskResult, AeoModelClient } from "./runner";
import { getAeoModelClient } from "./model-client";

/**
 * One HTTP client per answer engine, all satisfying the same `AeoModelClient`
 * the runner already takes. Claude keeps its existing SDK-based client; the
 * others are plain `fetch`, matching how Stripe and Upstash are talked to
 * elsewhere in this codebase — no new dependency for a JSON POST.
 *
 * The request builders and response parsers are exported and pure, so each
 * engine's wire format is unit-tested without touching the network.
 *
 * Every failure path returns a reason, never a verdict. An engine that errors,
 * truncates, or returns something unparseable produces "not checked" upstream —
 * it can never be rendered as "this business was not named".
 */

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Which field carries the answer-length limit. OpenAI retired `max_tokens` for
 * its current models (the API answers HTTP 400 "use max_completion_tokens"),
 * while Perplexity still speaks the older shape. Confirmed against the live
 * OpenAI API on 2026-09-03: sending `max_tokens` to gpt-5.4-mini fails every
 * question, so this is not cosmetic.
 */
export type OpenAiTokenLimitField = "max_tokens" | "max_completion_tokens";

/** OpenAI and Perplexity both speak the OpenAI chat-completions shape. */
export function openAiStyleBody(input: {
  model: string;
  system: string;
  user: string;
  schema: AeoJsonSchema;
  maxTokens: number;
  tokenLimitField: OpenAiTokenLimitField;
}): Record<string, unknown> {
  return {
    model: input.model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    [input.tokenLimitField]: input.maxTokens,
    response_format: {
      type: "json_schema",
      json_schema: { name: AEO_TOOL_NAME, strict: true, schema: input.schema },
    },
  };
}

/**
 * Pull the JSON payload out of an OpenAI-shaped reply.
 *
 * A truncated reply is reported as an empty answer rather than parsed out of a
 * half-written object.
 */
export function parseOpenAiStyleResponse(json: unknown): AeoAskResult {
  const root = asRecord(json);
  const choices = Array.isArray(root?.choices) ? root.choices : [];
  const choice = asRecord(choices[0]);
  if (!choice) {
    return { ok: false, reason: "invalid_output", detail: "The engine returned no answer choice." };
  }
  if (choice.finish_reason === "length") {
    return {
      ok: false,
      reason: "empty_answer",
      detail: "The engine's answer was cut off before it could be recorded.",
    };
  }
  const message = asRecord(choice.message);
  const content = typeof message?.content === "string" ? message.content : "";
  if (!content.trim()) {
    return { ok: false, reason: "empty_answer", detail: "The engine returned no answer text." };
  }
  return parseJsonPayload(content);
}

/**
 * Gemini's structured output rejects `additionalProperties` and wants
 * upper-case type names, so the shared schema is translated rather than
 * duplicated — one schema stays the single source of truth.
 */
export function toGeminiSchema(schema: AeoJsonSchema): Record<string, unknown> {
  function convert(node: unknown): unknown {
    const record = asRecord(node);
    if (!record) return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (key === "additionalProperties") continue;
      if (key === "type" && typeof value === "string") {
        out.type = value.toUpperCase();
        continue;
      }
      if (key === "properties") {
        const properties = asRecord(value) ?? {};
        out.properties = Object.fromEntries(
          Object.entries(properties).map(([name, child]) => [name, convert(child)]),
        );
        continue;
      }
      if (key === "items") {
        out.items = convert(value);
        continue;
      }
      out[key] = value;
    }
    return out;
  }
  return convert(schema) as Record<string, unknown>;
}

export function geminiBody(input: {
  system: string;
  user: string;
  schema: AeoJsonSchema;
  maxTokens: number;
}): Record<string, unknown> {
  return {
    system_instruction: { parts: [{ text: input.system }] },
    contents: [{ role: "user", parts: [{ text: input.user }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: toGeminiSchema(input.schema),
      maxOutputTokens: input.maxTokens,
    },
  };
}

export function parseGeminiResponse(json: unknown): AeoAskResult {
  const root = asRecord(json);
  const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
  const candidate = asRecord(candidates[0]);
  if (!candidate) {
    const feedback = asRecord(root?.promptFeedback);
    const blocked = typeof feedback?.blockReason === "string" ? feedback.blockReason : null;
    return blocked
      ? { ok: false, reason: "refused", detail: `The engine blocked this question (${blocked}).` }
      : { ok: false, reason: "invalid_output", detail: "The engine returned no answer candidate." };
  }
  if (candidate.finishReason === "MAX_TOKENS") {
    return {
      ok: false,
      reason: "empty_answer",
      detail: "The engine's answer was cut off before it could be recorded.",
    };
  }
  if (candidate.finishReason === "SAFETY" || candidate.finishReason === "RECITATION") {
    return {
      ok: false,
      reason: "refused",
      detail: `The engine stopped answering (${String(candidate.finishReason)}).`,
    };
  }
  const content = asRecord(candidate.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const text = parts
    .map((part) => {
      const record = asRecord(part);
      return typeof record?.text === "string" ? record.text : "";
    })
    .join("");
  if (!text.trim()) {
    return { ok: false, reason: "empty_answer", detail: "The engine returned no answer text." };
  }
  return parseJsonPayload(text);
}

/** Shared: every engine returns the payload as a JSON string. */
function parseJsonPayload(text: string): AeoAskResult {
  try {
    return { ok: true, payload: JSON.parse(stripCodeFence(text)) };
  } catch {
    return {
      ok: false,
      reason: "invalid_output",
      detail: "The engine's reply was not the JSON structure it was asked for.",
    };
  }
}

/** Some engines wrap JSON in a markdown fence despite being asked not to. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z]*\s*/, "")
    .replace(/```$/, "")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function describeHttpFailure(status: number, json: unknown): string {
  const root = asRecord(json);
  const error = asRecord(root?.error);
  const message =
    (typeof error?.message === "string" && error.message) ||
    (typeof root?.message === "string" && root.message) ||
    "";
  const suffix = message ? `: ${message}` : "";
  return `The engine refused the request (HTTP ${status})${suffix}`.slice(0, 200);
}

/** HTTP failures are transport failures — always "not checked", never a verdict. */
async function postJson(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<{ ok: true; json: unknown } | { ok: false; result: AeoAskResult }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        result: {
          ok: false,
          reason: "model_unavailable",
          detail: describeHttpFailure(response.status, json),
        },
      };
    }
    return { ok: true, json };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    const detail = aborted
      ? "The engine did not answer within the time limit."
      : `The engine could not be reached: ${error instanceof Error ? error.message : "unknown error"}`;
    return { ok: false, result: { ok: false, reason: "model_unavailable", detail: detail.slice(0, 200) } };
  } finally {
    clearTimeout(timeout);
  }
}

function openAiStyleClient(input: {
  id: AeoEngineId;
  url: string;
  apiKey: string;
  tokenLimitField: OpenAiTokenLimitField;
}): AeoModelClient {
  const descriptor = AEO_ENGINES[input.id];
  const model = engineModel(input.id);
  return {
    provider: input.id,
    model,
    label: `${descriptor.productName} (${model})`,
    async ask({ system, user, schema, maxTokens }) {
      const posted = await postJson(
        input.url,
        { Authorization: `Bearer ${input.apiKey}` },
        openAiStyleBody({ model, system, user, schema, maxTokens, tokenLimitField: input.tokenLimitField }),
      );
      return posted.ok ? parseOpenAiStyleResponse(posted.json) : posted.result;
    },
  };
}

function geminiClient(apiKey: string): AeoModelClient {
  const descriptor = AEO_ENGINES.google;
  const model = engineModel("google");
  return {
    provider: "google",
    model,
    label: `${descriptor.productName} (${model})`,
    async ask({ system, user, schema, maxTokens }) {
      const posted = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { "x-goog-api-key": apiKey },
        geminiBody({ system, user, schema, maxTokens }),
      );
      return posted.ok ? parseGeminiResponse(posted.json) : posted.result;
    },
  };
}

/**
 * The client for one engine, or null when that engine is not connected.
 *
 * Null is the honest state: the runner turns it into "not checked" for every
 * question rather than a run of silent zeros.
 */
export function getEngineClient(id: AeoEngineId): AeoModelClient | null {
  const key = process.env[AEO_ENGINES[id].keyEnvVar]?.trim();
  if (!key) return null;
  switch (id) {
    case "anthropic":
      // Claude keeps the existing SDK client — same factory and same model
      // choice as the rest of the product.
      return getAeoModelClient();
    case "openai":
      return openAiStyleClient({
        id,
        url: "https://api.openai.com/v1/chat/completions",
        apiKey: key,
        tokenLimitField: "max_completion_tokens",
      });
    case "perplexity":
      return openAiStyleClient({
        id,
        url: "https://api.perplexity.ai/chat/completions",
        apiKey: key,
        tokenLimitField: "max_tokens",
      });
    case "google":
      return geminiClient(key);
  }
}
