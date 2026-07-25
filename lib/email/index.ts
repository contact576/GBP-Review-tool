import "server-only";

/**
 * Email delivery adapter (Resend). Ready-but-inactive: with no RESEND_API_KEY
 * the app degrades honestly — callers get `{ ok: false, reason: "not_configured" }`
 * and surface a truthful "queued — connect email to send" state, never a fake
 * success. Set RESEND_API_KEY (+ optional EMAIL_FROM) to activate live sends.
 */

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

const DEFAULT_FROM = "Foundly <onboarding@resend.dev>";

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Rendered HTML body. */
  html: string;
  /** Optional plaintext fallback. */
  text?: string;
  /** Override the From address (defaults to EMAIL_FROM or Resend's sandbox). */
  from?: string;
  replyTo?: string;
  /**
   * Adds RFC 8058 one-click unsubscribe headers. Gmail and Yahoo require these
   * on bulk mail, and without them marketing sends land in spam regardless of
   * the in-body link. Set this for every commercial message.
   */
  listUnsubscribeUrl?: string;
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_configured" | "error"; detail?: string };

/**
 * Send one transactional email. Never throws — returns a discriminated result
 * so callers can persist an honest delivery state.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "not_configured" };

  const from = input.from ?? process.env.EMAIL_FROM ?? DEFAULT_FROM;
  const listHeaders = input.listUnsubscribeUrl
    ? {
        "List-Unsubscribe": `<${input.listUnsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : undefined;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo,
        headers: listHeaders,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: "error", detail: detail.slice(0, 300) };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id ?? "sent" };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message : "network error",
    };
  }
}
