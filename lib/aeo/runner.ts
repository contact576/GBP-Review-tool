/**
 * Provider-agnostic AI-Visibility runner.
 *
 * Takes the business context, a set of money queries and ANY client that can
 * answer a prompt against a JSON schema, and returns one outcome per query.
 * It performs no network I/O itself, so it is fully unit-testable with a stub
 * client (see lib/aeo/__tests__).
 *
 * Honesty contract, enforced here and nowhere else:
 *   - A missing client (no API key) produces "not checked", never "not named".
 *   - A transport error produces "not checked", never "not named".
 *   - Output that fails validation produces "not checked", never "not named".
 *   - A refusal produces "not checked", never "not named".
 *   - `named` is derived from the answer text (lib/aeo/verdict.ts), never from
 *     a self-reported boolean.
 */

import { AEO_SYSTEM_PROMPT, buildAeoQueryPrompt } from "./prompt";
import { looksLikeRefusal } from "./matching";
import { AEO_ANSWER_SCHEMA, validateAeoAnswer, type AeoJsonSchema } from "./schema";
import { deriveVerdict } from "./verdict";
import type {
  AeoBusinessContext,
  AeoNotCheckedReason,
  AeoQueryOutcome,
  AeoRunRecord,
} from "./types";

/** What a model client hands back. Failures carry a reason, never a verdict. */
export type AeoAskResult =
  | { ok: true; payload: unknown }
  | { ok: false; reason: AeoNotCheckedReason; detail: string };

/**
 * The only thing the runner needs from a provider. Anthropic and OpenAI both
 * satisfy this — a JSON Schema plus a system/user pair is the common ground.
 */
export interface AeoModelClient {
  readonly provider: string;
  readonly model: string;
  /** Human label shown beside every claim, e.g. "Claude (claude-haiku-4-5)". */
  readonly label: string;
  ask(input: {
    system: string;
    user: string;
    schema: AeoJsonSchema;
    maxTokens: number;
  }): Promise<AeoAskResult>;
}

export interface RunAeoCheckInput {
  context: AeoBusinessContext;
  queries: string[];
  /** Null when no provider is configured — every query reports "not checked". */
  client: AeoModelClient | null;
  runId: string;
  now?: Date;
  /** Parallel in-flight requests. Kept small; these calls cost money. */
  concurrency?: number;
  maxTokens?: number;
}

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_TOKENS = 900;

/** Assistant label when nothing is configured — we still refuse to guess. */
export const UNCONFIGURED_ASSISTANT_LABEL = "No assistant configured";

export async function runAeoCheck(input: RunAeoCheckInput): Promise<AeoRunRecord> {
  const queries = dedupeQueries(input.queries);
  const client = input.client;
  const ranAt = (input.now ?? new Date()).toISOString();

  const results: AeoQueryOutcome[] = client
    ? await mapWithConcurrency(
        queries,
        input.concurrency ?? DEFAULT_CONCURRENCY,
        (query) => checkOneQuery(query, input.context, client, input.maxTokens ?? DEFAULT_MAX_TOKENS),
      )
    : queries.map<AeoQueryOutcome>((query) => ({
        status: "not_checked",
        query,
        reason: "no_api_key",
        detail: "No AI provider API key is configured for this deployment.",
      }));

  const checked = results.filter((result) => result.status === "checked");
  return {
    schemaVersion: 1,
    runId: input.runId,
    ranAt,
    provider: client?.provider ?? "none",
    model: client?.model ?? "none",
    assistantLabel: client?.label ?? UNCONFIGURED_ASSISTANT_LABEL,
    results,
    checked: checked.length,
    notChecked: results.length - checked.length,
    named: checked.filter((result) => result.status === "checked" && result.named).length,
  };
}

async function checkOneQuery(
  query: string,
  context: AeoBusinessContext,
  client: AeoModelClient,
  maxTokens: number,
): Promise<AeoQueryOutcome> {
  let response: AeoAskResult;
  try {
    response = await client.ask({
      system: AEO_SYSTEM_PROMPT,
      user: buildAeoQueryPrompt(query),
      schema: AEO_ANSWER_SCHEMA,
      maxTokens,
    });
  } catch (error) {
    // A client that throws instead of returning is still just "not checked".
    return {
      status: "not_checked",
      query,
      reason: "model_unavailable",
      detail: errorDetail(error),
    };
  }

  if (!response.ok) {
    return { status: "not_checked", query, reason: response.reason, detail: response.detail };
  }

  let payload;
  try {
    payload = validateAeoAnswer(response.payload);
  } catch (error) {
    return { status: "not_checked", query, reason: "invalid_output", detail: errorDetail(error) };
  }

  if (looksLikeRefusal(payload.answer)) {
    return {
      status: "not_checked",
      query,
      reason: "refused",
      detail: "The assistant declined to name businesses for this question.",
    };
  }

  return deriveVerdict(query, payload, context);
}

function errorDetail(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown error").slice(0, 200);
}

function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of queries) {
    const query = raw.trim().replace(/\s+/g, " ").slice(0, 200);
    if (query.length < 3) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(query);
  }
  return out;
}

/** Bounded parallelism that preserves input order in the output array. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const width = Math.max(1, Math.min(limit, items.length));
  const out = new Array<R>(items.length);
  let cursor = 0;
  async function pump(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (index >= items.length || item === undefined) return;
      out[index] = await worker(item);
    }
  }
  await Promise.all(Array.from({ length: width }, () => pump()));
  return out;
}
