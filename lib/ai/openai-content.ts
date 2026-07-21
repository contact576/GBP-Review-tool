import "server-only";
import {
  buildGroundedContentPrompt,
  validateGeneratedContent,
  type GeneratedContentText,
  type GroundedContentInput,
} from "./content-studio";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TEXT_MODEL = "gpt-5.4-mini";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";

const CONTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string" },
    body: { type: "string" },
    callToAction: {
      type: "object",
      additionalProperties: false,
      properties: {
        actionType: { type: "string", enum: ["NONE", "LEARN_MORE", "BOOK", "CALL", "SIGN_UP"] },
        url: { type: "string" },
      },
      required: ["actionType", "url"],
    },
    altText: { type: "string" },
    imagePrompt: { type: "string" },
    evidenceSummary: { type: "array", items: { type: "string" }, maxItems: 6 },
  },
  required: ["headline", "body", "callToAction", "altText", "imagePrompt", "evidenceSummary"],
} as const;

function apiKey(): string {
  const value = process.env.OPENAI_API_KEY?.trim();
  if (!value) throw new Error("OpenAI is not connected. Add OPENAI_API_KEY to generate content.");
  return value;
}

async function openAiJson(path: string, body: Record<string, unknown>, timeoutMs: number): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${OPENAI_BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const json = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const error = json.error && typeof json.error === "object" ? json.error as Record<string, unknown> : {};
      const code = typeof error.code === "string" ? error.code : `http_${response.status}`;
      if (code === "insufficient_quota") {
        throw new Error("OpenAI is connected, but this project has no available API credits. Add billing or credits in OpenAI Platform, then try again.");
      }
      if (code === "model_not_found") {
        throw new Error("The configured OpenAI model is unavailable to this project. Choose an enabled model, then try again.");
      }
      throw new Error(`OpenAI could not generate this draft (${code}).`);
    }
    return json;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("OpenAI generation timed out. Try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function responseOutputText(response: Record<string, unknown>): string {
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as unknown[]
      : [];
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const raw = block as Record<string, unknown>;
      if (raw.type === "output_text" && typeof raw.text === "string") return raw.text;
    }
  }
  throw new Error("OpenAI returned no content draft.");
}

export async function generateGroundedContentText(input: GroundedContentInput): Promise<{
  content: GeneratedContentText;
  model: string;
}> {
  const model = process.env.FOUNDLY_OPENAI_TEXT_MODEL?.trim() || DEFAULT_TEXT_MODEL;
  const response = await openAiJson("/responses", {
    model,
    store: false,
    input: [
      {
        role: "system",
        content: "You are Foundly's evidence-grounded local business content editor. Follow the schema and safety rules exactly.",
      },
      { role: "user", content: buildGroundedContentPrompt(input) },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "foundly_content_preview",
        strict: true,
        schema: CONTENT_SCHEMA,
      },
    },
  }, 45_000);
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseOutputText(response));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("OpenAI returned malformed structured content.");
    throw error;
  }
  return { content: validateGeneratedContent(parsed, input.kind), model };
}

export async function generateLocalPostImage(prompt: string): Promise<{
  base64Data: string;
  mimeType: "image/webp";
  model: string;
}> {
  const model = process.env.FOUNDLY_OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  const response = await openAiJson("/images/generations", {
    model,
    prompt,
    n: 1,
    size: "1536x1024",
    quality: "medium",
    output_format: "webp",
    background: "opaque",
  }, 120_000);
  const data = Array.isArray(response.data) ? response.data : [];
  const first = data[0] && typeof data[0] === "object" ? data[0] as Record<string, unknown> : {};
  const base64Data = typeof first.b64_json === "string" ? first.b64_json : "";
  if (!base64Data || base64Data.length > 30_000_000 || !/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
    throw new Error("OpenAI returned an invalid image asset.");
  }
  return { base64Data, mimeType: "image/webp", model };
}
