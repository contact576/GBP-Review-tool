import Link from "next/link";
import { getSessionAndData } from "@/lib/data";
import { readEmailSettings } from "@/lib/email/config";
import { Badge } from "@/components/ds/misc";
import { Icon, type IconName } from "@/components/icons";
import { SettingsShell } from "../SettingsShell";
import { Callout, SettingsSection } from "../SettingsUI";
import { googleSignInEnabled } from "@/lib/google/config";
import { smsEnabled, smsMissingEnvVars, smsSenderDescription } from "@/lib/sms/twilio";
import { parseSmsTestDetail } from "@/lib/sms/test-status";
import { EmailChannelPanel, type EmailChannelNotice } from "./EmailChannelPanel";
import { SmsChannelPanel, type SmsChannelView } from "./SmsChannelPanel";

/**
 * Outcome of the Gmail connect redirect (`?gmail=` / `?error=`), turned into
 * one honest callout. Unknown codes render nothing rather than a vague error.
 */
function gmailNotice(params: Record<string, string | string[] | undefined>): EmailChannelNotice | null {
  const one = (k: string) => (Array.isArray(params[k]) ? params[k]?.[0] : params[k]) ?? "";
  const gmail = one("gmail");
  const error = one("error");
  if (gmail === "connected") {
    return {
      tone: "success",
      title: "Gmail connected",
      text: "A test email was delivered to your mailbox. Review requests, invites and reports now send from it.",
    };
  }
  if (gmail === "test_failed") {
    return {
      tone: "warning",
      title: "Gmail connected, but the test send failed",
      text: "The grant is saved; the error below says why Google refused the message. Fix it (usually: enable the Gmail API for the app) and send a test again.",
    };
  }
  const errors: Record<string, string> = {
    gmail_cancelled: "You closed Google's consent screen before granting access. Nothing was changed.",
    gmail_state: "The sign-in state didn't match (the page was open too long, or cookies were blocked). Try again.",
    gmail_exchange: "Google rejected the sign-in code. Try connecting again.",
    gmail_scope: "The 'send email on your behalf' permission was not granted. Tick it on Google's consent screen.",
    gmail_offline_access: "Google did not return durable access. Connect again and approve the request.",
    gmail_identity: "Google did not say which mailbox you signed in with, so nothing was saved. Try again.",
    gmail_save: `Could not save the Gmail sender.${one("detail") ? ` ${one("detail")}` : ""}`,
    google_not_configured: "Google sign-in isn't configured for this deployment, so Gmail can't be connected.",
    forbidden: "Only the workspace owner or a manager can connect Gmail.",
  };
  const text = errors[error];
  return text ? { tone: "danger", title: "Gmail was not connected", text } : null;
}

export default async function ChannelsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { data, session } = await getSessionAndData();
  const integrations = data.integrations ?? [];
  const twilio = integrations.find((i) => i.provider === "twilio");
  const emailSettings = await readEmailSettings(session.workspaceId);

  // SMS is derived, never asserted: `smsEnabled()` is the same check every
  // send path and the Integrations tile use, so the two pages cannot disagree.
  const smsOn = smsEnabled();
  const lastTest = parseSmsTestDetail(twilio?.detail);
  const smsView: SmsChannelView = {
    enabled: smsOn,
    sender: smsOn ? smsSenderDescription() : null,
    missingEnv: smsOn ? [] : smsMissingEnvVars(),
    lastTest: smsOn && lastTest ? { ...lastTest, at: twilio?.lastSyncAt } : null,
  };
  // Owner/manager, or an agency/platform admin acting inside a client
  // workspace — the same rule `sendTestSmsAction` enforces server-side.
  const canTestSms =
    session.role === "owner" ||
    session.role === "manager" ||
    ((session.role === "agency_admin" || session.role === "platform_admin") &&
      Boolean(session.homeWorkspaceId));
  const notice = gmailNotice(await searchParams);

  return (
    <SettingsShell title="Channels" sub="How review requests reach your customers.">
      <SettingsSection title="Delivery channels">
        <div className="divide-y divide-hairline">
          <EmailChannelPanel
            settings={emailSettings}
            accountEmail={session.email ?? ""}
            canEdit={session.role === "owner"}
            googleConfigured={googleSignInEnabled()}
            notice={notice}
          />

          <ChannelRow
            icon="chat"
            title="WhatsApp"
            detail="Ready — sends from your own WhatsApp, no API needed"
            badge={<Badge tone="primary" icon="check-circle">Ready</Badge>}
          >
            <p className="text-[14px] text-sub">
              Pick your customers, write one message, and Foundly opens each chat in WhatsApp Web
              with the text already filled in. You press send. Because the messages come from your
              own WhatsApp number, there is no Business API to apply for and nothing to verify.
            </p>
            <Callout tone="tip" className="mt-3">
              <Link href="/app/whatsapp" className="font-semibold text-primary underline">
                Open the WhatsApp sender
              </Link>{" "}
              to ask a batch of customers for reviews.
            </Callout>
          </ChannelRow>

          <SmsChannelPanel view={smsView} canTest={canTestSms} />
        </div>
      </SettingsSection>
    </SettingsShell>
  );
}

function ChannelRow({
  icon,
  title,
  detail,
  badge,
  muted,
  children,
}: {
  icon: IconName;
  title: string;
  detail: string;
  badge: React.ReactNode;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={muted ? "py-4 opacity-80" : "py-4"}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-btn bg-primary-wash text-primary">
            <Icon name={icon} size={20} />
          </div>
          <div>
            <div className="text-[15px] font-bold text-ink">{title}</div>
            <div className="text-[13px] text-faint">{detail}</div>
          </div>
        </div>
        {badge}
      </div>
      <div className="pl-0 sm:pl-[52px]">{children}</div>
    </div>
  );
}
