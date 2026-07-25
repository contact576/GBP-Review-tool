import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "@/lib/ai/client";
import { getModel, hasAiKey } from "@/lib/ai/model";
import { AEO_TOOL_NAME } from "./schema";
import type { AeoAskResult, AeoModelClient } from "./runner";

/**
 * Anthropic-backed implementation of `AeoModelClient`.
 *
 * Reuses the existing client factory in lib/ai/client.ts and the existing model
 * selection in lib/ai/model.ts — no new SDK, no new dependency, no second
 * source of truth for which model this product runs on.
 *
 * Structured output uses a forced single-tool call, which is Anthropic's
 * equivalent of the strict `json_schema` response format lib/ai/openai-content.ts
 * uses. The schema is still re-validated by `validateAeoAnswer` afterwards.
 *
 * `null` means "not configured". It is deliberately NOT an empty stub client:
 * the runner must be able to tell "we never asked" apart from "we asked and the
 * business wasn't named".
 */
export function getAeoModelClient(): AeoModelClient | null {
  if (!hasAiKey()) return null;
  const anthropic = getAnthropic();
  if (!anthropic) return null;
  const model = getModel();

  return {
    provider: "anthropic",
    model,
    label: `Claude (${model})`,
    async ask({ system, user, schema, maxTokens }): Promise<AeoAskResult> {
      try {
        const message = await anthropic.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
          tools: [
            {
              name: AEO_TOOL_NAME,
              description:
                "Record your answer to the question and the business names it contains.",
              input_schema: schema as Anthropic.Tool.InputSchema,
            },
          ],
          tool_choice: { type: "tool", name: AEO_TOOL_NAME },
        });

        const toolUse = message.content.find(
          (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
        );
        if (!toolUse) {
          return {
            ok: false,
            reason: message.stop_reason === "max_tokens" ? "empty_answer" : "invalid_output",
            detail:
              message.stop_reason === "max_tokens"
                ? "The assistant's answer was cut off before it could be recorded."
                : `The assistant returned no structured result (stop reason: ${message.stop_reason ?? "unknown"}).`,
          };
        }
        return { ok: true, payload: toolUse.input };
      } catch (error) {
        return { ok: false, reason: "model_unavailable", detail: describeError(error) };
      }
    },
  };
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.slice(0, 200);
  }
  return "The assistant request failed for an unknown reason.";
}
