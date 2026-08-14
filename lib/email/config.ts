import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { encryptSecret, decryptSecret } from "@/lib/google/crypto";

/**
 * Per-workspace outbound email sender configuration.
 *
 * Two ways to switch email on, both self-serve from Settings → Channels:
 *
 *   • "resend" — paste a Resend API key. Hosted, best deliverability, but the
 *     sending domain has to be verified inside Resend first.
 *   • "smtp"   — point at any mailbox the business already owns (Gmail with an
 *     app password, Microsoft 365, their host's mail server). Nothing to sign
 *     up for, which is the whole point for owners who can't or won't set up an
 *     API account.
 *
 * Secrets live only as AES-256-GCM envelopes (lib/google/crypto). Nothing here
 * ever returns a decrypted secret to a client component — `readEmailSettings`
 * is the UI-facing shape and deliberately omits it.
 */

export type EmailProvider = "resend" | "smtp";

/** Full config including the decrypted secret. Server-side delivery only. */
export interface EmailSenderConfig {
  provider: EmailProvider;
  secret: string;
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpSecure?: boolean;
  /** "workspace" when configured in-app, "env" when inherited from env vars. */
  source: "workspace" | "env";
}

/** Redacted, client-safe view of the stored config. */
export interface EmailSettingsView {
  configured: boolean;
  provider: EmailProvider | null;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  smtpHost: string;
  smtpPort: number | null;
  smtpUser: string;
  smtpSecure: boolean;
  /** True once a real test send has succeeded on the current credentials. */
  verified: boolean;
  verifiedAt: string | null;
  lastError: string | null;
  /**
   * Set when no workspace row exists but env vars provide a fallback sender,
   * so the UI can say "inherited from environment" instead of "not connected".
   */
  envFallback: boolean;
}

export interface SaveEmailSettingsInput {
  provider: EmailProvider;
  /** Omit to keep the currently stored secret (so the UI never round-trips it). */
  secret?: string;
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpSecure?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Env-var sender, used when a workspace hasn't configured its own. */
function envConfig(): EmailSenderConfig | null {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Foundly <onboarding@resend.dev>";
  if (resendKey) {
    return { provider: "resend", secret: resendKey, fromEmail: from, source: "env" };
  }
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (host && user && pass) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    return {
      provider: "smtp",
      secret: pass,
      fromEmail: process.env.EMAIL_FROM ?? user,
      smtpHost: host,
      smtpPort: Number.isFinite(port) ? port : 587,
      smtpUser: user,
      smtpSecure: process.env.SMTP_SECURE === "true" || port === 465,
      source: "env",
    };
  }
  return null;
}

/** True when *some* sender exists at the env level (no workspace context). */
export function envEmailConfigured(): boolean {
  return envConfig() !== null;
}

/**
 * Request-scoped, because `emailEnabledFor` runs on every workspace render
 * (it decides the Channels tile's status) and again on every send. Without the
 * cache that is three round trips per request for a single-row lookup.
 */
const readRow = cache(async function readRow(workspaceId: string) {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(t.emailCredential)
      .where(eq(t.emailCredential.workspaceId, workspaceId))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    // No database (memory provider / local demo) — fall back to env.
    return null;
  }
});

/**
 * Resolve the sender to use for a workspace: its own config first, env second.
 * Returns null when neither exists, so callers can degrade honestly.
 */
export async function resolveEmailSender(
  workspaceId?: string,
): Promise<EmailSenderConfig | null> {
  if (workspaceId) {
    const row = await readRow(workspaceId);
    if (row) {
      const secret = decryptSecret(row.encryptedSecret);
      // A secret that won't decrypt means the encryption key rotated. Falling
      // through to env is better than throwing mid-send.
      if (secret) {
        return {
          provider: row.provider === "smtp" ? "smtp" : "resend",
          secret,
          fromEmail: row.fromEmail,
          fromName: row.fromName ?? undefined,
          replyTo: row.replyTo ?? undefined,
          smtpHost: row.smtpHost ?? undefined,
          smtpPort: row.smtpPort ?? undefined,
          smtpUser: row.smtpUser ?? undefined,
          smtpSecure: row.smtpSecure ?? undefined,
          source: "workspace",
        };
      }
    }
  }
  return envConfig();
}

/** Client-safe settings for the Channels screen. Never includes the secret. */
export async function readEmailSettings(workspaceId: string): Promise<EmailSettingsView> {
  const row = await readRow(workspaceId);
  const env = envConfig();
  if (!row) {
    return {
      configured: false,
      provider: env?.provider ?? null,
      fromEmail: env?.fromEmail ?? "",
      fromName: "",
      replyTo: "",
      smtpHost: env?.smtpHost ?? "",
      smtpPort: env?.smtpPort ?? null,
      smtpUser: env?.smtpUser ?? "",
      smtpSecure: env?.smtpSecure ?? false,
      verified: false,
      verifiedAt: null,
      lastError: null,
      envFallback: env !== null,
    };
  }
  return {
    configured: true,
    provider: row.provider === "smtp" ? "smtp" : "resend",
    fromEmail: row.fromEmail,
    fromName: row.fromName ?? "",
    replyTo: row.replyTo ?? "",
    smtpHost: row.smtpHost ?? "",
    smtpPort: row.smtpPort ?? null,
    smtpUser: row.smtpUser ?? "",
    smtpSecure: row.smtpSecure ?? false,
    verified: Boolean(row.verifiedAt),
    verifiedAt: row.verifiedAt,
    lastError: row.lastError,
    envFallback: false,
  };
}

/**
 * Upsert a workspace's sender. Saving always clears `verifiedAt` — the config
 * changed, so the previous successful test no longer proves anything.
 */
export async function saveEmailSettings(
  workspaceId: string,
  input: SaveEmailSettingsInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const existing = await readRow(workspaceId);
  const secret = input.secret?.trim() || (existing ? decryptSecret(existing.encryptedSecret) : null);
  if (!secret) {
    return {
      ok: false,
      reason:
        input.provider === "resend"
          ? "Paste your Resend API key."
          : "Enter the mailbox password or app password.",
    };
  }

  const now = nowIso();
  const values = {
    workspaceId,
    provider: input.provider,
    encryptedSecret: encryptSecret(secret),
    fromEmail: input.fromEmail,
    fromName: input.fromName ?? null,
    replyTo: input.replyTo ?? null,
    smtpHost: input.provider === "smtp" ? input.smtpHost ?? null : null,
    smtpPort: input.provider === "smtp" ? input.smtpPort ?? null : null,
    smtpUser: input.provider === "smtp" ? input.smtpUser ?? null : null,
    smtpSecure: input.provider === "smtp" ? input.smtpSecure ?? false : null,
    verifiedAt: null,
    lastError: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  try {
    const db = getDb();
    await db
      .insert(t.emailCredential)
      .values(values)
      .onConflictDoUpdate({ target: t.emailCredential.workspaceId, set: values });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Could not save email settings.",
    };
  }
}

/** Record the outcome of a test send so the UI reflects reality, not intent. */
export async function recordEmailTestResult(
  workspaceId: string,
  result: { ok: boolean; detail?: string },
): Promise<void> {
  try {
    const db = getDb();
    await db
      .update(t.emailCredential)
      .set({
        verifiedAt: result.ok ? nowIso() : null,
        lastError: result.ok ? null : (result.detail ?? "Test send failed").slice(0, 400),
        updatedAt: nowIso(),
      })
      .where(eq(t.emailCredential.workspaceId, workspaceId));
  } catch {
    // Best-effort bookkeeping — a failure here must not mask the send result.
  }
}

/** Remove a workspace's sender. Env fallback (if any) takes over again. */
export async function deleteEmailSettings(workspaceId: string): Promise<void> {
  try {
    const db = getDb();
    await db.delete(t.emailCredential).where(eq(t.emailCredential.workspaceId, workspaceId));
  } catch {
    // Nothing stored / no database — deleting is already the end state.
  }
}
