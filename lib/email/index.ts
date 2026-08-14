import "server-only";

import {
  envEmailConfigured,
  resolveEmailSender,
  type EmailSenderConfig,
} from "./config";

/**
 * Email delivery adapter.
 *
 * Two backends behind one call: Resend (hosted API) and plain SMTP (any mailbox
 * the business already owns). Which one runs is decided per workspace by
 * lib/email/config — a workspace's own saved sender wins, env vars are the
 * fallback, and with neither the adapter degrades honestly: callers get
 * `{ ok: false, reason: "not_configured" }` and surface a truthful
 * "queued — connect email to send" state, never a fake success.
 */

/**
 * Whether *any* sender exists at the env level. Kept for callers that have no
 * workspace in hand; prefer `emailEnabledFor(workspaceId)` where one exists.
 */
export function emailEnabled(): boolean {
  return envEmailConfigured();
}

/** Whether this workspace can send — its own sender, or the env fallback. */
export async function emailEnabledFor(workspaceId?: string): Promise<boolean> {
  return (await resolveEmailSender(workspaceId)) !== null;
}

const DEFAULT_FROM = "Foundly <onboarding@resend.dev>";

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Rendered HTML body. */
  html: string;
  /** Optional plaintext fallback. */
  text?: string;
  /** Override the From address (defaults to the configured sender). */
  from?: string;
  replyTo?: string;
  /** Use this workspace's saved sender instead of the env fallback. */
  workspaceId?: string;
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_configured" | "error"; detail?: string };

/** Compose the RFC 5322 From header from the stored name/address pair. */
function fromHeader(config: EmailSenderConfig, override?: string): string {
  if (override) return override;
  if (config.fromName && !config.fromEmail.includes("<")) {
    return `${config.fromName} <${config.fromEmail}>`;
  }
  return config.fromEmail || DEFAULT_FROM;
}

async function sendViaResend(
  config: EmailSenderConfig,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromHeader(config, input.from),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo ?? config.replyTo,
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

async function sendViaSmtp(
  config: EmailSenderConfig,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  if (!config.smtpHost || !config.smtpUser) {
    return { ok: false, reason: "not_configured" };
  }
  try {
    // Imported lazily so the SMTP client is never pulled into a request that
    // sends through Resend (or doesn't send at all).
    const nodemailer = (await import("nodemailer")).default;
    const port = config.smtpPort ?? 587;
    const transport = nodemailer.createTransport({
      host: config.smtpHost,
      port,
      // Implicit TLS on 465; STARTTLS upgrade on 587/25.
      secure: config.smtpSecure ?? port === 465,
      auth: { user: config.smtpUser, pass: config.secret },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    });
    const info = await transport.sendMail({
      from: fromHeader(config, input.from),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo ?? config.replyTo,
    });
    return { ok: true, id: info.messageId ?? "sent" };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message.slice(0, 300) : "SMTP send failed",
    };
  }
}

/**
 * Send one transactional email. Never throws — returns a discriminated result
 * so callers can persist an honest delivery state.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const config = await resolveEmailSender(input.workspaceId);
  if (!config) return { ok: false, reason: "not_configured" };
  return config.provider === "smtp"
    ? sendViaSmtp(config, input)
    : sendViaResend(config, input);
}
