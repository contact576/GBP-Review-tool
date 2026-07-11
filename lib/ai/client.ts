import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/** Server-only Anthropic client factory. Returns null when no key is set. */
let client: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

/** Low-level text completion. Returns null on any failure so callers fall back. */
export async function completeText(args: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string | null> {
  const anthropic = getAnthropic();
  if (!anthropic) return null;
  try {
    const msg = await anthropic.messages.create({
      model: args.model,
      max_tokens: args.maxTokens ?? 700,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    });
    const parts = msg.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    return parts || null;
  } catch {
    return null;
  }
}
