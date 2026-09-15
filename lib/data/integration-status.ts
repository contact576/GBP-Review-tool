import "server-only";
import { emailEnabled } from "@/lib/email";
import { smsEnabled, smsMissingEnvVars, smsSenderDescription } from "@/lib/sms/twilio";
import { parseSmsTestDetail } from "@/lib/sms/test-status";
import type { FoundlyData, Integration } from "./types";

/**
 * Live reconciliation of the integration tiles that have no connect flow.
 *
 * `website`, `resend` and `twilio` were written once at workspace creation
 * (see `emptyWorkspace`) and no code path ever updated them again — so a
 * workspace with RESEND_API_KEY set and a website on file still reported
 * "Email sending activates once the platform email service is configured"
 * and "A verified website URL is required", forever. Unlike `google`,
 * `instagram` and `stripe`, these three have no callback or webhook to write
 * a status from, so they are derived at read time instead:
 *
 *  - resend / twilio are *platform* config. They change on redeploy, with no
 *    per-workspace event to hang a write off, so a stored row would go stale
 *    the moment an env var moves.
 *  - website is per-workspace but is edited through the business settings
 *    form, which has no reason to know about the integrations table.
 *
 * Deriving keeps all three self-healing. Demo workspaces are left untouched:
 * their seeded values are a curated sales surface, not a claim about this
 * deployment's environment.
 */
export function reconcileIntegrations(
  data: FoundlyData,
  /**
   * Email is no longer platform-only: a workspace can save its own Resend key
   * or SMTP mailbox in Settings → Channels. That lookup is async and needs a
   * database, so the caller resolves it (see `loadWorkspaceData`) and passes
   * the answer in. Omitted, this falls back to the env-level check.
   */
  overrides?: {
    emailOn?: boolean;
    /**
     * Which sender is live, e.g. "Gmail · you@domain.com" (see
     * `describeEmailSender`), so the tile names the mailbox instead of a
     * generic "configured". `needsReconnect` is the Gmail grant having been
     * revoked — the tile must say so, not "connected".
     */
    emailSender?: { label: string; needsReconnect: boolean } | null;
  },
): FoundlyData {
  if (data.workspace.isDemo) return data;
  const integrations = data.integrations ?? [];
  if (integrations.length === 0) return data;

  const website = data.location.website?.trim();
  const emailOn = overrides?.emailOn ?? emailEnabled();
  const emailSender = overrides?.emailSender ?? null;
  const smsOn = smsEnabled();

  return {
    ...data,
    integrations: integrations.map((integration) => {
      switch (integration.provider) {
        case "website":
          return website
            ? patch(integration, "connected", `Website on file (${displayHost(website)}) — used for fact cross-checking`)
            : patch(integration, "disconnected", "A verified website URL is required for fact cross-checking");
        case "resend":
          if (emailSender?.needsReconnect) {
            return patch(
              integration,
              "needs_attention",
              `${emailSender.label} — Google revoked access; reconnect Gmail in Settings → Channels`,
            );
          }
          if (emailOn) {
            return patch(
              integration,
              "connected",
              emailSender
                ? `${emailSender.label} — review requests send live`
                : "Email service configured — review requests send live",
            );
          }
          return patch(integration, "pending", "Add a sender in Settings → Channels to start sending email");
        case "twilio": {
          if (!smsOn) {
            return patch(
              integration,
              "disconnected",
              `SMS not configured — set ${smsMissingEnvVars().join(", ")}; review requests fall back to email`,
            );
          }
          // A real "Send test SMS" outcome (lib/sms/actions.ts) is the one
          // stored detail more truthful than the env-derived line — keep it,
          // and keep its status honest (a failed test is needs_attention).
          const test = parseSmsTestDetail(integration.detail);
          if (test) return patch(integration, test.ok ? "connected" : "needs_attention", integration.detail);
          const sender = smsSenderDescription();
          return patch(
            integration,
            "connected",
            `SMS sender configured${sender ? ` (${sender})` : ""} — review requests can send by text`,
          );
        }
        default:
          return integration;
      }
    }),
  };
}

function patch(integration: Integration, status: Integration["status"], detail: string): Integration {
  if (integration.status === status && integration.detail === detail) return integration;
  return { ...integration, status, detail };
}

/** Bare hostname for display — a full URL in a status line reads as noise. */
function displayHost(value: string): string {
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`).hostname.replace(/^www\./, "");
  } catch {
    return value.slice(0, 60);
  }
}
