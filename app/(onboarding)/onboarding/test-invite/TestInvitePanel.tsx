"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ds";
import { Icon } from "@/components/icons";

export function TestInvitePanel() {
  const [sent, setSent] = useState(false);

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
            <Icon name="send" size={20} />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-ink">Preview invite</div>
            <div className="text-[13px] text-sub">We&apos;ll email a sample review request to your inbox.</div>
          </div>
        </div>
        {sent ? (
          <div className="flex items-center gap-2 rounded-btn bg-primary-tint px-3 py-2.5 text-[13px] font-semibold text-primary-dark">
            <Icon name="check-circle" size={16} /> Sent! Check your email.
          </div>
        ) : (
          <Button variant="primary" size="md" fullWidth icon="send" onClick={() => setSent(true)}>
            Send test invite
          </Button>
        )}
      </Card>

      <Link
        href="/r/demo"
        className="flex items-center justify-between rounded-card border border-hairline bg-card px-4 py-3 transition-colors hover:border-primary/40"
      >
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-btn bg-primary text-white">
            <Icon name="external" size={18} />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-ink">Open your review page</div>
            <div className="text-[13px] text-sub">The live page customers land on.</div>
          </div>
        </div>
        <Icon name="chevron-right" size={18} className="shrink-0 text-faint" />
      </Link>
    </div>
  );
}
