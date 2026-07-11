"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Chip, Badge } from "@/components/ds/misc";
import { Field, Input, Textarea } from "@/components/ds/form";
import { useToast } from "@/components/ds/Toast";
import { Icon } from "@/components/icons";
import { filterAudience } from "@/lib/compliance/consent";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { formatNumber } from "@/lib/utils/format";
import { createCampaignAction } from "@/lib/actions";
import type { Customer, CampaignType, Channel } from "@/lib/data/types";

const TYPES: { key: CampaignType; label: string; icon: "gift" | "refresh" | "clock" | "sparkles"; defaultName: string }[] = [
  { key: "promo", label: "Promo", icon: "gift", defaultName: "Seasonal promo" },
  { key: "winback", label: "Win-back", icon: "refresh", defaultName: "We miss you" },
  { key: "reminder", label: "Reminder", icon: "clock", defaultName: "Time for a check-in" },
  { key: "festival", label: "Festival", icon: "sparkles", defaultName: "Holiday hello" },
];

export function CampaignComposer({
  customers,
  business,
  locationId,
}: {
  customers: Customer[];
  business: string;
  locationId: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [type, setType] = useState<CampaignType>("promo");
  const [name, setName] = useState("Seasonal promo");
  const [goal, setGoal] = useState("");
  const [channel, setChannel] = useState<Channel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);

  // LAW-CRITICAL: recompute the eligible marketing audience live.
  const audience = useMemo(() => filterAudience(customers, "marketing"), [customers]);
  const consented = audience.eligible.length;
  const total = customers.length;
  const canSend = consented > 0 && body.trim().length > 0;

  function pickType(t: CampaignType) {
    setType(t);
    const def = TYPES.find((x) => x.key === t);
    if (def && (name === "" || TYPES.some((x) => x.defaultName === name))) setName(def.defaultName);
  }

  async function aiDraft() {
    setDrafting(true);
    try {
      const res = await fetch("/api/ai/campaign-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, business, goal, channel }),
      });
      const json = (await res.json()) as { subject?: string; body?: string };
      if (json.subject) setSubject(json.subject);
      if (json.body) setBody(json.body);
    } catch {
      toast("Couldn't draft copy — write your own", "warning", "alert");
    } finally {
      setDrafting(false);
    }
  }

  function send() {
    if (!canSend) return;
    start(async () => {
      const result = await createCampaignAction({
        locationId,
        name: name.trim() || "Untitled campaign",
        type,
        consentBasis: "marketing",
        channel,
        subject: channel === "email" ? subject.trim() || undefined : undefined,
        body: body.trim(),
      });
      toast(`Scheduled to ${formatNumber(result.consented)} opted-in customers`, "success", "check-circle");
      router.push("/app/campaigns");
    });
  }

  return (
    <div className="space-y-5">
      {/* Type */}
      <Card>
        <div className="kicker mb-2">Campaign type</div>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <Chip key={t.key} selected={type === t.key} onClick={() => pickType(t.key)} icon={t.icon}>
              {t.label}
            </Chip>
          ))}
        </div>
      </Card>

      {/* LAW-CRITICAL audience banner */}
      <div className="rounded-card border border-primary/30 bg-primary-wash/70 p-4">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary text-white">
            <Icon name="users" size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-ink">
              Sending to {formatNumber(consented)} of {formatNumber(total)} who opted in to marketing
            </div>
            <p className="text-[13px] text-sub">
              We only include customers with explicit marketing consent. This count updates before every send.
            </p>
            {audience.excluded.length ? (
              <button
                type="button"
                onClick={() => setShowExcluded((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-dark"
              >
                {showExcluded ? "Hide" : "Show"} who&apos;s excluded
                <Icon name={showExcluded ? "chevron-down" : "chevron-right"} size={14} />
              </button>
            ) : null}
            {showExcluded ? (
              <ul className="mt-2 space-y-1">
                {audience.excluded.map((e) => (
                  <li key={e.reason} className="flex items-center justify-between rounded-btn bg-card px-3 py-1.5 text-[12px]">
                    <span className="text-sub">{e.reason}</span>
                    <span className="data-chip text-ink">{e.count}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      {/* Details */}
      <Card className="space-y-4">
        <Field label="Campaign name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Give it a name" />
        </Field>

        <Field label="Goal / offer" hint="Optional — helps the AI draft the right message.">
          <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. 15% off your next visit this month" />
        </Field>

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-ink">Channel</span>
          <div className="flex flex-wrap gap-2">
            <Chip selected={channel === "email"} onClick={() => setChannel("email")} icon="mail">
              Email
            </Chip>
            <Chip disabled icon="message">
              SMS · pending A2P
            </Chip>
          </div>
        </div>
      </Card>

      {/* Composer */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="kicker">Message</div>
          <Button variant="secondary" size="sm" icon="sparkles" onClick={aiDraft} loading={drafting}>
            AI draft
          </Button>
        </div>
        {channel === "email" ? (
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" />
          </Field>
        ) : null}
        <Field label="Body">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message. Use {first_name} to personalize."
            className="min-h-[140px]"
          />
        </Field>
      </Card>

      {/* Device preview */}
      <div>
        <div className="kicker mb-2">Preview</div>
        <div className="mx-auto max-w-sm overflow-hidden rounded-card border border-hairline bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-hairline bg-paper px-4 py-2.5">
            <div className="grid size-7 place-items-center rounded-chip bg-primary text-[11px] font-bold text-white">
              {business.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold text-ink">{business}</div>
              <div className="truncate text-[11px] text-faint">
                {channel === "email" ? subject || "Your subject line" : "Text message"}
              </div>
            </div>
          </div>
          <div className="px-4 py-4">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink/90">
              {body || "Your message preview appears here."}
            </p>
            <div className="mt-4 border-t border-hairline pt-3 text-[11px] text-faint">
              You&apos;re receiving this because you opted in to marketing from {business}.{" "}
              <span className="underline">Unsubscribe</span> anytime.
            </div>
          </div>
        </div>
      </div>

      {/* Compliance guard */}
      <div className="flex items-start gap-2 rounded-btn border border-hairline bg-paper px-3 py-2.5">
        <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-[12px] text-sub">
          {MICROCOPY.noIncentive} Campaigns can&apos;t offer rewards in exchange for a review — every send includes a working unsubscribe.
        </p>
      </div>

      {/* Send */}
      <div className="space-y-2">
        <Button onClick={send} loading={pending} disabled={!canSend} icon="send" size="lg" fullWidth>
          Review &amp; send to {formatNumber(consented)} customers
        </Button>
        {consented === 0 ? (
          <p className="text-center text-[12px] text-danger">
            No customers have opted in to marketing — nothing can be sent.
          </p>
        ) : body.trim().length === 0 ? (
          <p className="text-center text-[12px] text-faint">Add a message to enable sending.</p>
        ) : null}
      </div>
    </div>
  );
}
