import { Badge, Card } from "@/components/ds";
import { Icon } from "@/components/icons";
import { MICROCOPY } from "@/lib/compliance/microcopy";

/**
 * Honest channel states — nothing here pretends to activate. Email is the
 * default channel; SMS requires real carrier registration; WhatsApp is later.
 */
export function ChannelsPanel() {
  return (
    <div className="space-y-3">
      {/* Email — the default channel, on for every workspace */}
      <Card className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
          <Icon name="mail" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-ink">Email</span>
            <Badge tone="primary" icon="check-circle">On — default channel</Badge>
          </div>
          <div className="text-[13px] text-sub">
            Review invites go out by email the moment a visit is logged.
          </div>
        </div>
      </Card>

      {/* SMS — honest: requires carrier registration, no pretend activation */}
      <Card className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
          <Icon name="message" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-ink">SMS</span>
            <Badge tone="sub" icon="clock">Not yet available</Badge>
          </div>
          <div className="text-[13px] text-sub">
            Requires carrier registration (1–5 days) — available after launch setup.
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

      <div className="flex items-start gap-2 rounded-btn border border-hairline bg-card px-3 py-2.5 text-[12px] text-sub">
        <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-primary" />
        <span>{MICROCOPY.caslNote}</span>
      </div>
    </div>
  );
}
