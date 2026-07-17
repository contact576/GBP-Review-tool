import { getData } from "@/lib/data";
import { Badge } from "@/components/ds/misc";
import { Icon, type IconName } from "@/components/icons";
import { SettingsShell } from "../SettingsShell";
import { Callout, SettingsSection } from "../SettingsUI";

export default async function ChannelsSettingsPage() {
  const data = await getData();
  const integrations = data.integrations ?? [];
  const resend = integrations.find((i) => i.provider === "resend");
  const twilio = integrations.find((i) => i.provider === "twilio");

  return (
    <SettingsShell title="Channels" sub="How review requests reach your customers.">
      {/* Email */}
      <SettingsSection title="Delivery channels">
        <div className="divide-y divide-hairline">
          <ChannelRow
            icon="mail"
            title="Email"
            detail={resend?.detail ?? "Sending domain verified"}
            badge={<Badge tone="primary" icon="check-circle">Verified</Badge>}
          >
            <p className="text-[14px] text-sub">
              Your sending domain is authenticated (SPF, DKIM, DMARC), so requests land in the inbox
              — not spam.
            </p>
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
              Until approval, requests fall back to email so nothing gets stuck.
            </Callout>
          </ChannelRow>

          <ChannelRow
            icon="chat"
            title="WhatsApp"
            detail="Coming later — not yet available"
            badge={<Badge tone="sub">Phase 3</Badge>}
            muted
          >
            <p className="text-[14px] text-faint">
              WhatsApp Business messaging is on the roadmap for a later phase. It&apos;s disabled for
              now.
            </p>
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
      <div className="pl-[52px]">{children}</div>
    </div>
  );
}
