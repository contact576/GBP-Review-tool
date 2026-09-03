import "server-only";

import {
  envEmailConfigured,
  resolveEmailSender,
  setEmailCredentialStatus,
  type EmailSenderConfig,
} from "./config";
import { buildGmailRaw } from "./gmail-mime";

/**
 * Email delivery adapter.
 *
 * Three backends behind one call: Resend (hosted API), plain SMTP (any mailbox
 * the business already owns), and Gmail (OAuth grant — the Gmail API sends from
 * the owner's own address). Which one runs is decided per workspace by
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
  /**
   * Adds RFC 8058 one-click unsubscribe headers. Gmail and Yahoo require these
   * on bulk mail, and without them marketing sends land in spam regardless of
   * the in-body link. Set this for every commercial message.
   */
  listUnsubscribeUrl?: string;
}

/**
 * RFC 8058 one-click unsubscribe headers, shared by both backends — the
 * requirement is about what lands in the recipient's inbox, so it cannot
 * depend on whether this workspace sends through Resend or its own mailbox.
 */
function listHeaders(url?: string): Record<string, string> | undefined {
  if (!url) return undefined;
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
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
        headers: listHeaders(input.listUnsubscribeUrl),
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
      headers: listHeaders(input.listUnsubscribeUrl),
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

const GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export const GMAIL_RECONNECT_MESSAGE =
  "Gmail access was revoked or expired — reconnect Gmail in Settings → Channels.";

/**
 * Gmail API backend. `config.secret` is the Google refresh token (encrypted at
 * rest, decrypted by the resolver); every send mints a short-lived access
 * token from it, so nothing long-lived is ever cached in memory.
 *
 * Google's invalid_grant (400/401 on refresh, or 401 on send) means the owner
 * revoked access or the grant expired — no retry will fix it, so the stored
 * credential is flagged needs_reconnect and the Channels page says
 * "Reconnect Gmail" instead of every review request failing quietly.
 * A later successful send clears the flag again.
 *
 * Exported so the connect callback can send its verification email directly
 * against the config it just saved, without depending on the request-scoped
 * resolver cache having observed the write.
 */
export async function sendViaGmail(
  config: EmailSenderConfig,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  if (!config.secret) return { ok: false, reason: "not_configured" };
  const workspaceId = config.source === "workspace" ? input.workspaceId : undefined;

  const flagReconnect = async (detail: string): Promise<SendEmailResult> => {
    if (workspaceId) await setEmailCredentialStatus(workspaceId, "needs_reconnect", detail);
    return { ok: false, reason: "error", detail };
  };

  try {
    // Lazily imported: the GBP client is a large module that has no business
    // in a Resend or SMTP send.
    const { refreshAccessToken } = await import("@/lib/google/gbp");
    const token = await refreshAccessToken(config.secret);
    if (!token.ok) {
      if (token.reason === "unauthorized") return flagReconnect(GMAIL_RECONNECT_MESSAGE);
      return { ok: false, reason: "error", detail: token.detail.slice(0, 300) };
    }

    const raw = buildGmailRaw({
      from: fromHeader(config, input.from),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo ?? config.replyTo,
      headers: listHeaders(input.listUnsubscribeUrl),
    });

    const res = await fetch(GMAIL_SEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.data.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
      cache: "no-store",
    });
    if (res.status === 401) return flagReconnect(GMAIL_RECONNECT_MESSAGE);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const detail =
        res.status === 403
          ? `Gmail refused the send (${res.status}) — the Gmail API may not be enabled for this app, or the gmail.send scope was not granted. ${body.slice(0, 200)}`
          : `Gmail send ${res.status}: ${body.slice(0, 250)}`;
      return { ok: false, reason: "error", detail: detail.slice(0, 400) };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    if (workspaceId && config.status === "needs_reconnect") {
      await setEmailCredentialStatus(workspaceId, null);
    }
    return { ok: true, id: data.id ?? "sent" };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message.slice(0, 300) : "Gmail send failed",
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
  switch (config.provider) {
    case "gmail":
      return sendViaGmail(config, input);
    case "smtp":
      return sendViaSmtp(config, input);
    default:
      return sendViaResend(config, input);
  }
}
