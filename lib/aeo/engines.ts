/**
 * The AI answer engines this check can be run against.
 *
 * AI-Visibility used to mean one assistant: whatever Claude said was the whole
 * picture. That is not what a business is actually exposed to — a customer may
 * ask ChatGPT, Gemini, Perplexity or Claude, and those four answer the same
 * question differently. A verdict from a single engine was being read as
 * "AI visibility" when it only ever described one of them.
 *
 * This registry names each engine, how it is connected, and — importantly for
 * how its result should be read — whether it answers from the live web or from
 * the model's own knowledge. Those are different claims and the UI says which.
 *
 * An engine with no key is NOT a failure and is never scored: it is reported as
 * "not connected", with the exact environment variable that would connect it.
 * Absence of a key can never be rendered as absence from an answer.
 */

/** Stable ids, also used as the stored key for an engine's results. */
export type AeoEngineId = "anthropic" | "openai" | "google" | "perplexity";

export const AEO_ENGINE_IDS: readonly AeoEngineId[] = [
  "openai",
  "anthropic",
  "google",
  "perplexity",
] as const;

/**
 * How an engine arrives at an answer.
 *
 * - `web_search` — it retrieves live pages and answers from them. Its answer
 *   reflects what is findable on the web right now.
 * - `model_knowledge` — it answers from what the model already knows. Its
 *   answer reflects training data, not today's web.
 *
 * The distinction matters to the owner: not being named by a web-grounded
 * engine is a statement about current findability; not being named by a
 * knowledge-only engine is not.
 */
export type AeoGrounding = "web_search" | "model_knowledge";

export interface AeoEngineDescriptor {
  id: AeoEngineId;
  /** What people call it. */
  productName: string;
  /** The company behind it, for attribution next to a claim. */
  vendor: string;
  grounding: AeoGrounding;
  /** The environment variable that connects it. */
  keyEnvVar: string;
  /** Optional override for which model is asked. */
  modelEnvVar: string;
  defaultModel: string;
  /** One line explaining what this engine's answer does and does not mean. */
  readingNote: string;
}

export const AEO_ENGINES: Record<AeoEngineId, AeoEngineDescriptor> = {
  openai: {
    id: "openai",
    productName: "ChatGPT",
    vendor: "OpenAI",
    grounding: "model_knowledge",
    keyEnvVar: "OPENAI_API_KEY",
    modelEnvVar: "FOUNDLY_AEO_OPENAI_MODEL",
    defaultModel: "gpt-5.4-mini",
    readingNote:
      "Answers from the model's own knowledge over the API. It is not the same surface as ChatGPT's browsing mode.",
  },
  anthropic: {
    id: "anthropic",
    productName: "Claude",
    vendor: "Anthropic",
    grounding: "model_knowledge",
    keyEnvVar: "ANTHROPIC_API_KEY",
    modelEnvVar: "FOUNDLY_AEO_ANTHROPIC_MODEL",
    defaultModel: "claude-haiku-4-5-20251001",
    readingNote:
      "Answers from the model's own knowledge. Being unnamed here is not evidence about today's web.",
  },
  google: {
    id: "google",
    productName: "Google Gemini",
    vendor: "Google",
    grounding: "model_knowledge",
    keyEnvVar: "GOOGLE_AI_API_KEY",
    modelEnvVar: "FOUNDLY_AEO_GEMINI_MODEL",
    defaultModel: "gemini-2.0-flash",
    readingNote:
      "The Gemini API model. This is not Google's AI Overviews, which are not available through any API.",
  },
  perplexity: {
    id: "perplexity",
    productName: "Perplexity",
    vendor: "Perplexity",
    grounding: "web_search",
    keyEnvVar: "PERPLEXITY_API_KEY",
    modelEnvVar: "FOUNDLY_AEO_PERPLEXITY_MODEL",
    defaultModel: "sonar",
    readingNote:
      "Searches the live web before answering, so its result is the closest thing here to current findability.",
  },
};

export function engineDescriptor(id: AeoEngineId): AeoEngineDescriptor {
  return AEO_ENGINES[id];
}

/** The model this engine will be asked, honouring its env override. */
export type AeoEnv = Readonly<Record<string, string | undefined>>;

export function engineModel(id: AeoEngineId, env: AeoEnv = process.env): string {
  const descriptor = AEO_ENGINES[id];
  const override = env[descriptor.modelEnvVar]?.trim();
  if (override) return override;
  // Claude keeps using the app-wide model setting so AI-Visibility and the rest
  // of the product cannot drift onto different Claude models.
  if (id === "anthropic") {
    const appWide = env.FOUNDLY_AI_MODEL?.trim();
    if (appWide) return appWide;
  }
  return descriptor.defaultModel;
}

export function engineIsConnected(id: AeoEngineId, env: AeoEnv = process.env): boolean {
  return Boolean(env[AEO_ENGINES[id].keyEnvVar]?.trim());
}

export interface AeoEngineAvailability {
  id: AeoEngineId;
  descriptor: AeoEngineDescriptor;
  connected: boolean;
  model: string;
  /** Exactly what is missing, when it is not connected. */
  missing: string | null;
}

/**
 * What can and cannot be asked in this deployment right now. The UI renders
 * this verbatim rather than implying an engine was checked and said no.
 */
export function engineAvailability(env: AeoEnv = process.env): AeoEngineAvailability[] {
  return AEO_ENGINE_IDS.map((id) => {
    const descriptor = AEO_ENGINES[id];
    const connected = engineIsConnected(id, env);
    return {
      id,
      descriptor,
      connected,
      model: engineModel(id, env),
      missing: connected ? null : `${descriptor.keyEnvVar} is not set`,
    };
  });
}

export function connectedEngineIds(env: AeoEnv = process.env): AeoEngineId[] {
  return AEO_ENGINE_IDS.filter((id) => engineIsConnected(id, env));
}
