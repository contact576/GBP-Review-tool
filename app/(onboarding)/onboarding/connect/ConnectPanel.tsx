"use client";

import { useState } from "react";
import { Badge, Button, Card } from "@/components/ds";
import { Icon, type IconName } from "@/components/icons";
import { MICROCOPY } from "@/lib/compliance/microcopy";

const SCOPES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "eye",
    title: "Read reviews & performance",
    body: "See new reviews, ratings, and how people find you on Maps and Search.",
  },
  {
    icon: "pencil",
    title: "Publish approved edits",
    body: "Update photos, services, and posts — only after you tap Approve.",
  },
];

export function ConnectPanel() {
  const [connected, setConnected] = useState(false);

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="kicker">Why connect</div>
        {SCOPES.map((s) => (
          <div key={s.title} className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
              <Icon name={s.icon} size={18} />
            </div>
            <div>
              <div className="text-[14px] font-semibold text-ink">{s.title}</div>
              <div className="text-[13px] text-sub">{s.body}</div>
            </div>
          </div>
        ))}
      </Card>

      {connected ? (
        <div className="flex items-center gap-3 rounded-card border border-primary/30 bg-primary-tint px-4 py-3.5">
          <Icon name="check-circle" size={22} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-primary-dark">Connected to Google</div>
            <div className="truncate text-[12px] text-primary-dark/80">Harbourview Physiotherapy · syncing now</div>
          </div>
          <Badge tone="primary" icon="check">Live</Badge>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          icon="google"
          onClick={() => setConnected(true)}
        >
          Connect Google
        </Button>
      )}

      <div className="flex items-start gap-2 rounded-btn border border-hairline bg-card px-3 py-2.5 text-[12px] text-sub">
        <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-primary" />
        <span>{MICROCOPY.nameStuffBlocked}</span>
      </div>
    </div>
  );
}
