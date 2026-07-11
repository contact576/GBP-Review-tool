/** Default to a cheap, fast Haiku-class model — keeps AI usage lean. */
export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export function getModel(): string {
  return process.env.FOUNDLY_AI_MODEL || DEFAULT_MODEL;
}

export function hasAiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
