"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Chip, Badge } from "@/components/ds/misc";
import { Field, Input, Textarea } from "@/components/ds/form";
import { useToast } from "@/components/ds/Toast";
import { Icon } from "@/components/icons";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { formatNumber } from "@/lib/utils/format";
import { buildAudienceSnapshot } from "@/lib/campaigns/audience";
import { estimateCampaignCredits } from "@/lib/campaigns/credits";
import { checkCampaignContent } from "@/lib/campaigns/content";
import {
  createAndScheduleCampaignAction,
  createAndSendCampaignAction,
  createCampaignAction,
  testSendCampaignAction,
} from "@/lib/actions";
import type {
  CampaignType,
  Channel,
  Customer,
  Subscription,
  SuppressionEntry,
} from "@/lib/data/types";

const TYPES: { key: CampaignType; label: string; icon: "gift" | "refresh" | "clock" | "sparkles"; defaultName: string }[] = [
  { key: "promo", label: "Promo", icon: "gift", defaultName: "Seasonal promo" },
  { key: "winback", label: "Win-back", icon: "refresh", defaultName: "We miss you" },
  { key: "reminder", label: "Reminder", icon: "clock", defaultName: "Time for a check-in" },
  { key: "festival", label: "Festival", icon: "sparkles", defaultName: "Holiday hello" },
];

/** `datetime-local` wants a local wall-clock string with no zone suffix. */
function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function CampaignComposer({
  customers,
  suppression,
  usage,
  business,
  locationId,
  ownerEmail,
  emailReady,
  smsReady,
}: {
  customers: Customer[];
  suppression: SuppressionEntry[];
  usage: Subscription["usage"];
  business: string;
  locationId: string;
  ownerEmail: string;
  /** Resolved server-side from the provider keys — never guessed in the client. */
  emailReady: boolean;
  smsReady: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [testing, setTesting] = useState(false);

  const [type, setType] = useState<CampaignType>("promo");
  const [name, setName] = useState("Seasonal promo");
  const [goal, setGoal] = useState("");
  const [channel, setChannel] = useState<Channel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [sendAt, setSendAt] = useState(() => toLocalInputValue(new Date(Date.now() + 86_400_000)));
  const [testTo, setTestTo] = useState(ownerEmail);

  // LAW-CRITICAL: resolved by the same function the send path uses, so this
  // count is who will actually be contacted — consent, withdrawal, suppression
  // and channel reachability all included, not consent alone.
  const snapshot = useMemo(
    () => buildAudienceSnapshot({ customers, suppression, consentBasis: "marketing", channel }),
    [customers, suppression, channel],
  );
  const consented = snapshot.eligible;
  const total = snapshot.total;

  const estimate = useMemo(
    () => estimateCampaignCredits({ channel, recipients: consented, body, usage }),
    [channel, consented, body, usage],
  );

  const lint = useMemo(
    () => checkCampaignContent({ subject, body, businessName: business }),
    [subject, body, business],
  );

  const channelReady = channel === "email" ? emailReady : smsReady;
  const hasBody = body.trim().length > 0;
  const canSend = consented > 0 && hasBody && lint.ok && estimate.withinAllowance && channelReady;

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

  function draftInput() {
    return {
      locationId,
      name: name.trim() || "Untitled campaign",
      type,
      consentBasis: "marketing" as const,
      channel,
      subject: channel === "email" ? subject.trim() || undefined : undefined,
      body: body.trim(),
    };
  }

  async function sendTest() {
    if (!hasBody) return;
    setTesting(true);
    try {
      const result = await testSendCampaignAction({
        name: name.trim() || "Untitled campaign",
        channel,
        subject: channel === "email" ? subject.trim() || undefined : undefined,
        body: body.trim(),
        destination: testTo.trim() || undefined,
      });
      toast(result.note, result.ok ? "success" : "warning", result.ok ? "check-circle" : "alert");
    } finally {
      setTesting(false);
    }
  }

  function saveDraft() {
    start(async () => {
      const result = await createCampaignAction(draftInput());
      toast(
        `Draft saved for ${formatNumber(result.consented)} opted-in customers — nothing was sent`,
        "info",
        "file",
      );
      router.push("/app/campaigns");
    });
  }

  function sendNow() {
    if (!canSend) return;
    start(async () => {
      const result = await createAndSendCampaignAction(draftInput());
      // The action reports what actually happened. A refusal shows as a
      // refusal — there is no success toast for a send that did not send.
      toast(result.note, result.ok ? "success" : "warning", result.ok ? "send" : "alert");
      router.push(`/app/campaigns/${result.campaignId}`);
    });
  }

  function schedule() {
    if (!canSend) return;
    const when = new Date(sendAt);
    if (Number.isNaN(when.getTime())) {
      toast("Pick a valid date and time", "warning", "alert");
      return;
    }
    start(async () => {
      const result = await createAndScheduleCampaignAction({
        ...draftInput(),
        scheduledAt: when.toISOString(),
      });
      toast(
        result.ok
          ? `Scheduled for ${formatNumber(result.eligible)} customers — the audience is locked in now`
          : result.note,
        result.ok ? "success" : "warning",
        result.ok ? "clock" : "alert",
      );
      if (result.ok && result.campaignId) router.push(`/app/campaigns/${result.campaignId}`);
    });
  }

  return (
    <div className="space-y-5">
      {/* Type */}
      <Card>
        <div className="mb-2 text-[13px] font-bold text-sub">Campaign type</div>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <Chip key={t.key} selected={type === t.key} onClick={() => pickType(t.key)} icon={t.icon}>
              {t.label}
            </Chip>
          ))}
        </div>
      </Card>

      {/* LAW-CRITICAL audience banner */}
      <div className="rounded-card border border-primary/30 bg-primary-wash/70 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* Eligible audience as the hero figure — recomputed live. */}
          <div className="flex shrink-0 items-center gap-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary text-white">
              <Icon name="users" size={20} />
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[34px] font-extrabold leading-none tabular-nums tracking-tight text-ink">
                  {formatNumber(consented)}
                </span>
                <span className="text-[15px] font-semibold tabular-nums text-sub">/ {formatNumber(total)}</span>
              </div>
              <div className="kicker mt-1 normal-case">Eligible to receive this</div>
            </div>
          </div>
          <div className="hidden h-12 w-px shrink-0 bg-primary/15 sm:block" />
          <div className="min-w-0 flex-1">
            <Badge tone="primary" icon="shield">Marketing consent required</Badge>
            <p className="mt-1.5 text-[14px] text-sub">
              Only customers with explicit marketing consent, a usable{" "}
              {channel === "email" ? "email address" : "mobile number"} and no opt-out on record. This
              list is frozen the moment you send.
            </p>
          </div>
        </div>
        <div className="mt-3 min-w-0">
            {snapshot.excluded.length ? (
              <button
                type="button"
                onClick={() => setShowExcluded((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 text-[14px] font-semibold text-primary hover:text-primary-dark"
              >
                {showExcluded ? "Hide" : "Show"} who&apos;s excluded
                <Icon name={showExcluded ? "chevron-down" : "chevron-right"} size={14} />
              </button>
            ) : null}
            {showExcluded ? (
              <ul className="mt-2 space-y-1">
                {snapshot.excluded.map((e) => (
                  <li key={e.reason} className="flex items-center justify-between rounded-btn bg-card px-3 py-1.5 text-[12px]">
                    <span className="text-sub">{e.reason}</span>
                    <span className="data-chip tabular-nums text-ink">{formatNumber(e.count)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
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
          <span className="mb-1.5 block text-[14px] font-semibold text-ink">Channel</span>
          <div className="flex flex-wrap gap-2">
            <Chip selected={channel === "email"} onClick={() => setChannel("email")} icon="mail">
              Email
            </Chip>
            <Chip selected={channel === "sms"} onClick={() => setChannel("sms")} icon="message">
              SMS
            </Chip>
          </div>
          {!channelReady ? (
            <p className="mt-2 flex items-start gap-1.5 text-[13px] text-danger">
              <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
              {channel === "email"
                ? "Email delivery is not connected, so this cannot send yet. Add RESEND_API_KEY to activate it — you can still save the draft."
                : "SMS delivery is not connected, so this cannot send yet. Add your Twilio credentials to activate it — you can still save the draft."}
            </p>
          ) : null}
        </div>
      </Card>

      {/* Composer */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-bold text-sub">Message</div>
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

        {/* Compliance lints — incentive language blocks; the rest advise. */}
        {lint.blocking.map((flag) => (
          <div
            key={flag.code}
            className="flex items-start gap-2 rounded-btn border border-danger/40 bg-danger-tint px-3 py-2.5"
          >
            <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-danger" />
            <p className="text-[13px] text-ink">
              <span className="font-bold text-danger">Blocked. </span>
              {flag.message}
            </p>
          </div>
        ))}
        {lint.warnings.map((flag) => (
          <div
            key={flag.code}
            className="flex items-start gap-2 rounded-btn border border-gold/40 bg-gold-tint px-3 py-2.5"
          >
            <Icon name="flag" size={16} className="mt-0.5 shrink-0 text-gold-deep" />
            <p className="text-[13px] text-ink">{flag.message}</p>
          </div>
        ))}
      </Card>

      {/* Cost / quota — shown before the send, not after the bill. */}
      <Card className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="credit-card" size={16} className="text-primary" />
            <span className="text-[13px] font-bold text-sub">What this send costs</span>
          </div>
          <span className="data-chip tabular-nums text-ink">
            {formatNumber(estimate.creditsRequired)} credit{estimate.creditsRequired === 1 ? "" : "s"}
          </span>
        </div>
        <p className={estimate.withinAllowance ? "text-[13px] text-sub" : "text-[13px] font-semibold text-danger"}>
          {estimate.message}
        </p>
      </Card>

      {/* Device preview */}
      <div>
        <div className="mb-2 text-[13px] font-bold text-sub">Preview</div>
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
              {channel === "email" ? (
                <>
                  You&apos;re receiving this because you opted in to marketing from {business}.{" "}
                  <span className="underline">Unsubscribe</span> anytime.
                </>
              ) : (
                <>Reply STOP to opt out.</>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Test send — to the owner only, never counted as a campaign send. */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="eye" size={16} className="text-primary" />
          <span className="text-[13px] font-bold text-sub">Send yourself a test first</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder={channel === "email" ? "you@yourbusiness.com" : "+14155550123"}
            iconLeft={channel === "email" ? "mail" : "phone"}
            className="sm:flex-1"
          />
          <Button
            variant="secondary"
            icon="send"
            onClick={sendTest}
            loading={testing}
            disabled={!hasBody || !lint.ok}
          >
            Send test
          </Button>
        </div>
        <p className="text-[12px] text-faint">
          A test goes only to you, is labelled as a test, and never counts against this campaign or your SMS credits.
        </p>
      </Card>

      {/* Compliance guard */}
      <div className="flex items-start gap-2 rounded-btn border border-hairline bg-paper px-3 py-2.5">
        <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-[13px] text-sub">
          {MICROCOPY.noIncentive} Every email carries a working unsubscribe link, and texts only send
          between 8 AM and 9 PM in your customers&apos; local time.
        </p>
      </div>

      {/* Send */}
      <div className="space-y-3">
        <Button onClick={sendNow} loading={pending} disabled={!canSend} icon="send" size="lg" fullWidth>
          Send now to {formatNumber(consented)} {consented === 1 ? "customer" : "customers"}
        </Button>

        {scheduling ? (
          <Card className="space-y-3">
            <Field
              label="Send at"
              hint="Scheduled campaigns go out on the next daily send run after this time."
            >
              <Input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button onClick={schedule} loading={pending} disabled={!canSend} icon="clock" fullWidth>
                Schedule
              </Button>
              <Button variant="ghost" onClick={() => setScheduling(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" icon="clock" onClick={() => setScheduling(true)} fullWidth>
              Schedule for later
            </Button>
            <Button variant="ghost" icon="file" onClick={saveDraft} loading={pending} disabled={!hasBody} fullWidth>
              Save as draft
            </Button>
          </div>
        )}

        {consented === 0 ? (
          <p className="text-center text-[13px] text-danger">
            No customers are eligible — nobody has opted in to marketing on this channel.
          </p>
        ) : !hasBody ? (
          <p className="text-center text-[13px] text-faint">Add a message to send this campaign.</p>
        ) : !lint.ok ? (
          <p className="text-center text-[13px] text-danger">Fix the blocked wording above before sending.</p>
        ) : !estimate.withinAllowance ? (
          <p className="text-center text-[13px] text-danger">This send exceeds your remaining SMS credits.</p>
        ) : !channelReady ? (
          <p className="text-center text-[13px] text-danger">
            Delivery is not connected for this channel — save the draft and send once it is.
          </p>
        ) : null}
      </div>
    </div>
  );
}
