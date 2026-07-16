import { getData } from "@/lib/data";
import { Card } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon, type IconName } from "@/components/icons";
import { SettingsNav } from "../SettingsNav";

export default async function ChannelsSettingsPage() {
  const data = await getData();
  const integrations = data.integrations ?? [];
  const resend = integrations.find((i) => i.provider === "resend");
  const twilio = integrations.find((i) => i.provider === "twilio");

  return (
    <div className="space-y-5">
      <PageHeader title="Channels" sub="How review requests reach your customers." />

      <SettingsNav />

      {/* Email */}
      <ChannelCard
        icon="mail"
        title="Email"
        badge={<Badge tone="primary" icon="check-circle">Verified</Badge>}
        detail={resend?.detail ?? "Sending domain verified"}
      >
        <p className="text-[14px] text-sub">
          Your sending domain is authenticated (SPF, DKIM, DMARC), so requests land in the inbox — not spam.
        </p>
      </ChannelCard>

      {/* SMS */}
      <ChannelCard
        icon="message"
        title="SMS"
        badge={<Badge tone="gold" icon="clock">A2P pending</Badge>}
        detail={twilio?.detail ?? "A2P registration pending"}
      >
        <p className="text-[14px] text-sub">Carriers require A2P 10DLC registration before business texts can send.</p>
        <p className="text-[14px] text-sub">Yours is submitted — SMS switches on automatically once it clears.</p>
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[13px] font-semibold text-primary">What is A2P 10DLC?</summary>
          <p className="mt-1 max-w-[65ch] text-[13px] text-sub">
            US &amp; Canada carriers require businesses to register for A2P 10DLC before
            application-to-person texts can send. Carrier approval usually takes 1–5 business days after
            submission. We monitor the status and enable SMS the moment it clears — nothing for you to do.
          </p>
        </details>
        <div className="mt-3 flex items-start gap-2 rounded-btn border border-gold/40 bg-gold-tint/40 p-3">
          <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-gold-deep" />
          <p className="text-[13px] text-gold-deep">
            Until approval, requests fall back to email so nothing gets stuck.
          </p>
        </div>
      </ChannelCard>

      {/* WhatsApp */}
      <ChannelCard
        icon="chat"
        title="WhatsApp"
        badge={<Badge tone="sub">Phase 3</Badge>}
        detail="Coming later — not yet available"
        muted
      >
        <p className="text-[14px] text-faint">
          WhatsApp Business messaging is on the roadmap for a later phase. It&apos;s disabled for now.
        </p>
      </ChannelCard>
    </div>
  );
}

function ChannelCard({
  icon,
  title,
  badge,
  detail,
  muted,
  children,
}: {
  icon: IconName;
  title: string;
  badge: React.ReactNode;
  detail: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={muted ? "opacity-80" : undefined}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-btn bg-primary-wash text-primary">
            <Icon name={icon} size={20} />
          </div>
          <div>
            <div className="text-[16px] font-bold text-ink">{title}</div>
            <div className="text-[13px] text-faint">{detail}</div>
          </div>
        </div>
        {badge}
      </div>
      {children}
    </Card>
  );
}
