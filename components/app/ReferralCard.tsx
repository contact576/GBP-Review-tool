"use client";

import { useState } from "react";
import { Card } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import type { ReferralSummary } from "@/lib/data/provider";

export function ReferralCard({ link, summary }: { link: string; summary: ReferralSummary }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const text = "Try Foundly for local reviews and Google Business Profile growth.";
    if (navigator.share) {
      await navigator.share({ title: "Foundly", text, url: link }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_500);
  }
  return (
    <Card className="border-gold/30 bg-gold-tint/40">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-gold text-ink">
          <Icon name="gift" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-bold text-ink">Referral rewards</h2>
            <Badge tone="gold">$50 invoice credit</Badge>
          </div>
          <p className="mt-1 max-w-[68ch] text-[14px] text-sub">
            Share your private link. When a referred business starts a paid plan, Stripe applies a $50 credit to your next invoice automatically.
          </p>
          <div className="mt-3 grid max-w-lg grid-cols-3 gap-2">
            <Stat label="Signed up" value={summary.signedUp} />
            <Stat label="Qualified" value={summary.qualified} />
            <Stat label="Applied" value={`$${summary.creditsApplied}`} />
          </div>
          {summary.pendingCredits > 0 ? (
            <p className="mt-2 text-[12px] font-semibold text-gold-deep">
              ${summary.pendingCredits} is waiting for Stripe customer billing details.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" icon={copied ? "check" : "send"} onClick={share}>
              {copied ? "Link copied" : "Share referral link"}
            </Button>
            <code className="max-w-full truncate rounded-btn border border-hairline bg-card px-2.5 py-2 text-[11px] text-sub">{link}</code>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-btn border border-gold/20 bg-card/70 px-3 py-2"><div className="text-[18px] font-extrabold tabular-nums text-ink">{value}</div><div className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</div></div>;
}
