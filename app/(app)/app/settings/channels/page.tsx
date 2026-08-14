import Link from "next/link";
import { getSessionAndData } from "@/lib/data";
import { readEmailSettings } from "@/lib/email/config";
import { Badge } from "@/components/ds/misc";
import { Icon, type IconName } from "@/components/icons";
import { SettingsShell } from "../SettingsShell";
import { Callout, SettingsSection } from "../SettingsUI";
import { EmailChannelPanel } from "./EmailChannelPanel";

export default async function ChannelsSettingsPage() {
  const { data, session } = await getSessionAndData();
  const integrations = data.integrations ?? [];
  const twilio = integrations.find((i) => i.provider === "twilio");
  const emailSettings = await readEmailSettings(session.workspaceId);

  return (
    <SettingsShell title="Channels" sub="How review requests reach your customers.">
      <SettingsSection title="Delivery channels">
        <div className="divide-y divide-hairline">
          <EmailChannelPanel
            settings={emailSettings}
            accountEmail={session.email ?? ""}
            canEdit={session.role === "owner"}
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

          <ChannelRow
            icon="message"
            title="SMS"
            detail={twilio?.detail ?? "A2P registration pending"}
            badge={<Badge tone="gold" icon="clock">A2P pending</Badge>}
          >
            <p className="text-[14px] text-sub">
              Carriers require A2P 10DLC registration before business texts can send. Yours is
              submitted — SMS switches on automatically once it clears.
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer text-[13px] font-semibold text-primary">
                What is A2P 10DLC?
              </summary>
              <p className="mt-1 max-w-[65ch] text-[13px] text-sub">
                US &amp; Canada carriers require businesses to register for A2P 10DLC before
                application-to-person texts can send. Carrier approval usually takes 1–5 business
                days after submission. We monitor the status and enable SMS the moment it clears —
                nothing for you to do.
              </p>
            </details>
            <Callout tone="warning" className="mt-3">
              Until approval, requests fall back to email or WhatsApp so nothing gets stuck.
            </Callout>
          </ChannelRow>
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
