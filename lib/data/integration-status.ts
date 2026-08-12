import "server-only";
import { emailEnabled } from "@/lib/email";
import { smsEnabled } from "@/lib/sms/twilio";
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
export function reconcileIntegrations(data: FoundlyData): FoundlyData {
  if (data.workspace.isDemo) return data;
  const integrations = data.integrations ?? [];
  if (integrations.length === 0) return data;

  const website = data.location.website?.trim();
  const emailOn = emailEnabled();
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
          return emailOn
            ? patch(integration, "connected", "Email service configured — review requests send live")
            : patch(integration, "pending", "Email sending activates once the platform email service is configured");
        case "twilio":
          return smsOn
            ? patch(integration, "connected", "SMS sender configured — review requests can send by text")
            : patch(integration, "disconnected", "SMS requires carrier registration (1–5 days)");
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
