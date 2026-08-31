/**
 * Strict structured-output contract for one AI-Visibility question.
 *
 * Mirrors the pattern in lib/ai/content-studio.ts: a frozen JSON schema handed
 * to the provider (Anthropic tool `input_schema`, OpenAI `json_schema`) PLUS a
 * hand-written validator that re-checks everything on the way back in. The
 * schema is a request, not a guarantee — the validator is the guarantee.
 *
 * Deliberately absent from the schema: anything resembling a verdict. The model
 * reports what it wrote; `lib/aeo/verdict.ts` decides what that means.
 */

export interface AeoJsonSchema {
  type: "object";
  additionalProperties: boolean;
  properties: Record<string, unknown>;
  required: string[];
  [key: string]: unknown;
}

export const AEO_TOOL_NAME = "record_assistant_answer";

export const AEO_ANSWER_SCHEMA: AeoJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: {
      type: "string",
      description:
        "Your complete natural answer to the question, written exactly as you would answer a member of the public who asked it.",
    },
    businessesNamed: {
      type: "array",
      maxItems: 12,
      items: { type: "string" },
      description:
        "Every specific business name that appears in your answer, copied character-for-character from it, in the order they appear. Empty array if your answer names no specific business.",
    },
  },
  required: ["answer", "businessesNamed"],
};

/** The validated shape of one model reply. */
export interface AeoAnswerPayload {
  answer: string;
  businessesNamed: string[];
}

const MIN_ANSWER_CHARS = 20;
const MAX_ANSWER_CHARS = 8_000;
const MAX_NAMES = 12;
const MAX_NAME_CHARS = 80;

/**
 * Throws on anything we cannot trust. Callers turn the throw into a
 * "not checked / invalid_output" outcome — never into a verdict.
 */
export function validateAeoAnswer(value: unknown): AeoAnswerPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The assistant returned no structured answer object.");
  }
  const raw = value as Record<string, unknown>;

  if (typeof raw.answer !== "string") {
    throw new Error("The assistant returned no answer text.");
  }
  const answer = raw.answer.trim();
  if (answer.length < MIN_ANSWER_CHARS) {
    throw new Error("The assistant's answer was too short to read a verdict from.");
  }
  if (answer.length > MAX_ANSWER_CHARS) {
    throw new Error("The assistant's answer exceeded the readable length limit.");
  }

  if (!Array.isArray(raw.businessesNamed)) {
    throw new Error("The assistant did not report which businesses it named.");
  }
  const businessesNamed = raw.businessesNamed
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_CHARS))
    .filter((item) => item.length > 1)
    .slice(0, MAX_NAMES);

  return { answer, businessesNamed };
}
