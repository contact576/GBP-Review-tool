"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession, type Session, type SessionRole } from "@/lib/auth/session";
import { getProviderFor } from "@/lib/data";
import { checkQuietHours } from "@/lib/compliance/quiet-hours";
import { consumeRateLimit } from "@/lib/security/api";
import { appUrl } from "@/lib/utils/app-url";
import { canonicalPhone, isE164 } from "./phone";
import { testSms } from "./templates";
import { formatSmsTestDetail } from "./test-status";
import { sendSms, smsEnabled, smsMissingEnvVars } from "./twilio";

/**
 * Settings → Channels → "Send test SMS".
 *
 * Mirrors `sendTestEmailAction` in lib/actions.ts: role-gated, validated,
 * rate-limited, and the outcome is written where the UI reads it from — here
 * the `twilio` integration tile, via `setIntegrationStatus` (SMS has no
 * per-workspace credential row to stamp; Twilio is platform env config).
 *
 * Quiet hours apply exactly as they do to real review requests: a test text
 * is still an A2P message to a real handset, and TCPA/CASL do not carve out
 * "just testing". Held tests are reported, not sent.
 */
export interface SmsTestActionResult {
  ok: boolean;
  message: string;
}

/** Same acting rule as `requireRole` in lib/actions.ts, which is not exported. */
async function requireRole(...allowed: SessionRole[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (allowed.includes(session.role)) return session;
  const acting =
    (session.role === "agency_admin" || session.role === "platform_admin") &&
    Boolean(session.homeWorkspaceId);
  if (acting && allowed.includes("owner")) return session;
  throw new Error("Forbidden");
}

export async function sendTestSmsAction(to: string): Promise<SmsTestActionResult> {
  const session = await requireRole("owner", "manager");
  const provider = await getProviderFor(session);
  const ws = session.workspaceId;

  const recipient = canonicalPhone(String(to ?? ""));
  if (!isE164(recipient)) {
    return {
      ok: false,
      message: "Enter the number in international E.164 format, e.g. +14155550123.",
    };
  }

  if (!smsEnabled()) {
    return {
      ok: false,
      message: `SMS is not configured on this deployment. Set ${smsMissingEnvVars().join(", ")} and redeploy.`,
    };
  }

  const limit = consumeRateLimit("sms-test-send", ws, 5, 60 * 60_000);
  if (!limit.allowed) {
    return { ok: false, message: "Too many test texts. Try again in an hour." };
  }

  const data = await provider.getData(ws);
  if (!data) return { ok: false, message: "Workspace not found." };

  const quiet = checkQuietHours({
    enabled: data.workspace.settings?.quietHours !== false,
    timezone: data.location.timezone,
    at: new Date(),
  });
  if (!quiet.allowed) {
    return { ok: false, message: `Not sent. ${quiet.reason}` };
  }

  const base = await appUrl();
  const requestId = `test_${randomBytes(8).toString("hex")}`;
  const result = await sendSms({
    to: recipient,
    body: testSms({ business: data.location.name }),
    statusCallback: `${base}/api/webhooks/twilio/status?workspaceId=${encodeURIComponent(ws)}&requestId=${encodeURIComponent(requestId)}`,
  });

  // Same bookkeeping shape as the email test: the tile reflects the last real
  // attempt, never a save. Best-effort — a write failure must not mask the send.
  try {
    await provider.setIntegrationStatus(
      ws,
      "twilio",
      result.ok ? "connected" : "needs_attention",
      formatSmsTestDetail(
        result.ok
          ? { ok: true, to: recipient, sid: result.sid }
          : { ok: false, to: recipient, error: result.error },
      ),
    );
  } catch {
    // Tile bookkeeping only.
  }
  revalidatePath("/app/settings", "layout");
  revalidatePath("/", "layout");

  if (result.ok) {
    return {
      ok: true,
      message: `Twilio accepted the test text for ${recipient} (${result.status}). Check the handset — carrier delivery is not confirmed here.`,
    };
  }
  return {
    ok: false,
    message:
      result.error === "not_configured"
        ? `SMS is not configured on this deployment. Set ${smsMissingEnvVars().join(", ")} and redeploy.`
        : `Twilio rejected the test: ${result.error}`,
  };
}
