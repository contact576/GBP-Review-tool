import { Badge, Card } from "@/components/ds";
import { Icon } from "@/components/icons";
import { MICROCOPY } from "@/lib/compliance/microcopy";

/**
 * Honest channel states — nothing here pretends to be on. Each row renders the
 * REAL state of that channel: the workspace's stored integration row combined
 * with whether the platform adapter is actually configured. Email is the
 * default channel but it is only shown as live when it can genuinely send;
 * otherwise the row says so and repeats the stored reason verbatim.
 */

export interface ChannelState {
  live: boolean;
  /** Stored integration status, when the workspace has a row for it. */
  status?: "connected" | "pending" | "disconnected" | "needs_attention";
  /** Stored explanation, shown verbatim so the UI never invents a reason. */
  detail?: string;
}

export function ChannelsPanel({ email, sms }: { email: ChannelState; sms: ChannelState }) {
  return (
    <div className="space-y-3">
      {/* Email — the default channel, live only when it can actually send */}
      <Card className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
          <Icon name="mail" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-bold text-ink">Email</span>
            {email.live ? (
              <Badge tone="primary" icon="check-circle">On — default channel</Badge>
            ) : (
              <Badge tone="gold" icon="clock">Not sending yet</Badge>
            )}
          </div>
          <div className="text-[13px] text-sub">
            {email.live
              ? "Review invites go out by email the moment a visit is logged."
              : email.detail ||
                "Requests are saved and queued — they send once the email service is configured."}
          </div>
        </div>
      </Card>

      {/* SMS — honest: carrier registration is real work, no pretend activation */}
      <Card className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
          <Icon name="message" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-bold text-ink">SMS</span>
            {sms.live ? (
              <Badge tone="primary" icon="check-circle">On</Badge>
            ) : sms.status === "pending" ? (
              <Badge tone="gold" icon="clock">Carrier approval pending</Badge>
            ) : (
              <Badge tone="sub" icon="clock">Not yet available</Badge>
            )}
          </div>
          <div className="text-[13px] text-sub">
            {sms.live
              ? "Invites can go out by text where you have a mobile number and consent."
              : sms.detail ||
                "Requires carrier registration (1–5 days) — available after launch setup."}
          </div>
        </div>
      </Card>

      {/* WhatsApp — manual click-to-chat, so it needs no approval to be "on" */}
      <Card className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
          <Icon name="chat" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-ink">WhatsApp</span>
            <Badge tone="primary" icon="check-circle">On — you press send</Badge>
          </div>
          <div className="text-[13px] text-sub">
            Opens each chat in your own WhatsApp with the message ready — no Business API needed.
          </div>
        </div>
      </Card>

      {!email.live && !sms.live ? (
        <div className="flex items-start gap-2 rounded-btn border border-hairline bg-card px-3 py-2.5 text-[12px] text-sub">
          <Icon name="alert" size={15} className="mt-0.5 shrink-0 text-gold-deep" />
          <span>
            No channel can send yet, so review requests will queue instead of going out. Your QR
            codes still work — every scan opens the review page directly.
          </span>
        </div>
      ) : null}

      <div className="flex items-start gap-2 rounded-btn border border-hairline bg-card px-3 py-2.5 text-[12px] text-sub">
        <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-primary" />
        <span>{MICROCOPY.caslNote}</span>
      </div>
    </div>
  );
}
