"use client";

import { useState } from "react";
import { Badge, Button, Card, Toggle } from "@/components/ds";
import { Icon } from "@/components/icons";
import { MICROCOPY } from "@/lib/compliance/microcopy";

export function ChannelsPanel() {
  const [email, setEmail] = useState(true);
  const [smsRequested, setSmsRequested] = useState(false);

  return (
    <div className="space-y-3">
      {/* Email — on by default */}
      <Card className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
          <Icon name="mail" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-ink">Email</span>
            <Badge tone="primary">Works instantly</Badge>
          </div>
          <div className="text-[13px] text-sub">Send review invites the moment a visit is logged.</div>
        </div>
        <Toggle checked={email} onChange={setEmail} label="Email invites" />
      </Card>

      {/* SMS — pending carrier approval */}
      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
            <Icon name="message" size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold text-ink">SMS</span>
              {smsRequested ? (
                <Badge tone="gold" icon="clock">Pending approval</Badge>
              ) : (
                <Badge tone="sub">Not active</Badge>
              )}
            </div>
            <div className="text-[13px] text-sub">Carrier approval takes 1–5 days (A2P 10DLC registration).</div>
          </div>
        </div>
        <Button
          variant={smsRequested ? "secondary" : "primary"}
          size="md"
          fullWidth
          disabled={smsRequested}
          icon={smsRequested ? "clock" : "phone"}
          onClick={() => setSmsRequested(true)}
        >
          {smsRequested ? "Activation requested" : "Activate SMS"}
        </Button>
      </Card>

      {/* WhatsApp — later phase */}
      <Card className="flex items-center gap-3 opacity-80">
        <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-faint">
          <Icon name="chat" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-ink">WhatsApp</span>
            <Badge tone="sub">Phase 3</Badge>
          </div>
          <div className="text-[13px] text-sub">Available later in Settings → Channels.</div>
        </div>
      </Card>

      <div className="flex items-start gap-2 rounded-btn border border-hairline bg-card px-3 py-2.5 text-[12px] text-sub">
        <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-primary" />
        <span>{MICROCOPY.caslNote}</span>
      </div>
    </div>
  );
}
