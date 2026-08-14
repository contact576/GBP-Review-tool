"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Badge, Chip, EmptyState, ProgressRail } from "@/components/ds/misc";
import { Field, Input, Textarea } from "@/components/ds/form";
import { useToast } from "@/components/ds/Toast";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/utils/format";
import {
  WHATSAPP_TEMPLATES,
  WHATSAPP_MERGE_TAGS,
  renderWhatsAppMessage,
} from "@/lib/whatsapp/templates";
import { whatsAppChatUrl, whatsAppWebUrl } from "@/lib/whatsapp/link";
import {
  prepareWhatsAppRequestsAction,
  markWhatsAppRequestSentAction,
  type WhatsAppRecipient,
} from "@/lib/actions";

/**
 * Bulk review asks over WhatsApp, without the Business API.
 *
 * The flow is deliberately three explicit steps — pick, write, send — because
 * the send step is manual by nature: each customer gets their own chat window
 * with the message pre-typed, and the owner presses send. Batching the picking
 * and writing is what makes twenty asks take two minutes instead of twenty.
 *
 * Nothing is marked "sent" until the owner confirms it in the queue. Skipping
 * someone leaves their request queued, so the ledger stays truthful.
 */

export interface WhatsAppCandidate {
  id: string;
  name: string;
  phoneDisplay: string;
  /** Non-null when this customer can't be asked, with the reason to show. */
  blockedReason: string | null;
  alreadyAsked: boolean;
  lastVisitAt?: string;
}

type Step = "pick" | "compose" | "send";

export function WhatsAppSender({
  candidates,
  locationId,
  business,
}: {
  candidates: WhatsAppCandidate[];
  locationId: string;
  business: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [step, setStep] = useState<Step>("pick");
  const [query, setQuery] = useState("");
  const [includeAsked, setIncludeAsked] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState(WHATSAPP_TEMPLATES[0]?.body ?? "");
  const [templateKey, setTemplateKey] = useState(WHATSAPP_TEMPLATES[0]?.key ?? "");

  // Queue state, populated once the requests are minted server-side.
  const [queue, setQueue] = useState<WhatsAppRecipient[]>([]);
  const [cursor, setCursor] = useState(0);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState(false);

  const eligible = useMemo(
    () => candidates.filter((c) => !c.blockedReason && (includeAsked || !c.alreadyAsked)),
    [candidates, includeAsked],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = candidates.filter((c) => includeAsked || !c.alreadyAsked || selected.has(c.id));
    if (!q) return pool;
    return pool.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phoneDisplay.replace(/\s/g, "").includes(q),
    );
  }, [candidates, query, includeAsked, selected]);

  const blockedCount = candidates.filter((c) => c.blockedReason).length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    const ids = visible.filter((c) => !c.blockedReason).map((c) => c.id);
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function applyTemplate(key: string) {
    const template = WHATSAPP_TEMPLATES.find((t) => t.key === key);
    if (!template) return;
    setTemplateKey(key);
    setMessage(template.body);
  }

  function insertTag(tag: string) {
    setMessage((prev) => `${prev}${prev.endsWith(" ") || !prev ? "" : " "}${tag}`);
  }

  function beginQueue() {
    start(async () => {
      const result = await prepareWhatsAppRequestsAction({
        locationId,
        customerIds: [...selected],
      });
      if (result.recipients.length === 0) {
        toast(
          result.skipped[0]?.reason ?? "None of those customers can be messaged right now.",
          "warning",
          "alert",
        );
        return;
      }
      if (result.skipped.length) {
        toast(
          `${result.skipped.length} customer${result.skipped.length === 1 ? "" : "s"} skipped — check consent and phone numbers.`,
          "info",
          "shield",
        );
      }
      setQueue(result.recipients);
      setCursor(0);
      setSentIds(new Set());
      setSkippedIds(new Set());
      setOpened(false);
      setStep("send");
    });
  }

  const current = queue[cursor];
  const currentMessage = current
    ? renderWhatsAppMessage(message, {
        name: current.name,
        business,
        link: current.link,
      })
    : "";

  function openChat(useWeb: boolean) {
    if (!current) return;
    const url = useWeb
      ? whatsAppWebUrl(current.phone, currentMessage)
      : whatsAppChatUrl(current.phone, currentMessage);
    window.open(url, "_blank", "noopener,noreferrer");
    setOpened(true);
  }

  function advance() {
    setOpened(false);
    setCursor((c) => c + 1);
  }

  function confirmSent() {
    if (!current) return;
    const requestId = current.requestId;
    setSentIds((prev) => new Set(prev).add(requestId));
    advance();
    start(async () => {
      await markWhatsAppRequestSentAction(requestId);
      router.refresh();
    });
  }

  function skipCurrent() {
    if (!current) return;
    setSkippedIds((prev) => new Set(prev).add(current.requestId));
    advance();
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(currentMessage);
      toast("Message copied — paste it into WhatsApp.", "success", "copy");
    } catch {
      toast("Couldn't copy. Select the message text and copy it manually.", "warning", "alert");
    }
  }

  // ── Step 3: the send queue ────────────────────────────────
  if (step === "send") {
    const done = cursor >= queue.length;
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="min-w-0 space-y-5">
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="kicker mb-1">Step 3 of 3</div>
                <h2 className="text-[18px] font-bold text-ink">
                  {done ? "All done" : `Send to ${current?.name}`}
                </h2>
              </div>
              <Badge tone="neutral">
                {Math.min(cursor + (done ? 0 : 1), queue.length)} of {queue.length}
              </Badge>
            </div>

            <ProgressRail current={cursor} total={queue.length} />

            {done ? (
              <div className="mt-5">
                <EmptyState
                  icon="check-circle"
                  title={`${sentIds.size} request${sentIds.size === 1 ? "" : "s"} sent`}
                  description={
                    skippedIds.size
                      ? `${skippedIds.size} skipped — those stay unasked, so you can come back to them.`
                      : "Every message in this batch was sent. They'll show up in Requests as you get opens and reviews."
                  }
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    icon="users"
                    onClick={() => {
                      setSelected(new Set());
                      setQueue([]);
                      setStep("pick");
                      router.refresh();
                    }}
                  >
                    Start another batch
                  </Button>
                  <Button variant="secondary" icon="send" onClick={() => router.push("/app/requests")}>
                    View requests
                  </Button>
                </div>
              </div>
            ) : current ? (
              <div className="mt-5 space-y-4">
                <div className="flex items-center gap-3 rounded-card border border-hairline bg-paper p-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-chip bg-primary-tint text-[13px] font-bold text-primary-dark">
                    {initials(current.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-ink">{current.name}</div>
                    <div className="data-chip text-[13px] text-sub">{current.phoneDisplay}</div>
                  </div>
                </div>

                <div>
                  <div className="kicker mb-1.5">Message they&apos;ll receive</div>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-card border border-hairline bg-card p-3 text-[14px] leading-relaxed text-ink">
                    {currentMessage}
                  </pre>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button icon="chat" onClick={() => openChat(false)}>
                    {opened ? "Reopen WhatsApp" : "Open WhatsApp"}
                  </Button>
                  <Button variant="secondary" icon="external" onClick={() => openChat(true)}>
                    Use WhatsApp Web
                  </Button>
                  <Button variant="ghost" icon="copy" onClick={copyMessage}>
                    Copy message
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
                  <Button icon="check" onClick={confirmSent} disabled={!opened}>
                    I sent it — next
                  </Button>
                  <Button variant="ghost" icon="arrow-right" onClick={skipCurrent}>
                    Skip
                  </Button>
                  {!opened ? (
                    <span className="text-[13px] text-faint">
                      Open the chat first, press send in WhatsApp, then confirm here.
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <Card>
            <div className="kicker mb-2">This batch</div>
            <ul className="max-h-[420px] space-y-1 overflow-auto">
              {queue.map((recipient, index) => {
                const isSent = sentIds.has(recipient.requestId);
                const isSkipped = skippedIds.has(recipient.requestId);
                return (
                  <li
                    key={recipient.requestId}
                    className={
                      "flex items-center gap-2 rounded-btn px-2 py-1.5 text-[13px] " +
                      (index === cursor ? "bg-primary-wash text-ink" : "text-sub")
                    }
                  >
                    <Icon
                      name={isSent ? "check-circle" : isSkipped ? "x" : "clock"}
                      size={14}
                      className={isSent ? "text-primary" : "text-faint"}
                    />
                    <span className="min-w-0 flex-1 truncate">{recipient.name}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </aside>
      </div>
    );
  }

  // ── Step 2: compose ───────────────────────────────────────
  if (step === "compose") {
    const sample = candidates.find((c) => selected.has(c.id));
    const preview = renderWhatsAppMessage(message, {
      name: sample?.name ?? "Alex Morgan",
      business,
      link: "https://foundly.app/r/abc123",
    });
    const missingLink = !/\{\{\s*link\s*\}\}/i.test(message);

    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <Card className="min-w-0">
          <div className="mb-4">
            <div className="kicker mb-1">Step 2 of 3</div>
            <h2 className="text-[18px] font-bold text-ink">Write the message</h2>
            <p className="mt-0.5 text-[13px] text-sub">
              Everyone gets the same message with their own name and review link filled in.
            </p>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {WHATSAPP_TEMPLATES.map((template) => (
              <Chip
                key={template.key}
                selected={templateKey === template.key}
                onClick={() => applyTemplate(template.key)}
              >
                {template.label}
              </Chip>
            ))}
          </div>

          <Field label="Message">
            <Textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setTemplateKey("");
              }}
              rows={8}
              className="min-h-[180px]"
            />
          </Field>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-faint">Insert:</span>
            {WHATSAPP_MERGE_TAGS.map((tag) => (
              <button
                key={tag.tag}
                type="button"
                onClick={() => insertTag(tag.tag)}
                title={tag.label}
                className="data-chip rounded-chip border border-hairline px-2 py-1 text-[12px] text-sub transition-colors hover:border-primary/40 hover:text-ink"
              >
                {tag.tag}
              </button>
            ))}
          </div>

          {missingLink ? (
            <div className="mt-3 flex items-start gap-2 rounded-btn border border-gold/40 bg-gold-tint/50 px-3 py-2">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-gold-deep" />
              <p className="text-[13px] text-sub">
                Your message has no <span className="data-chip">{"{{link}}"}</span>, so customers
                won&apos;t get a review link. Add it before sending.
              </p>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2 border-t border-hairline pt-4">
            <Button
              icon="chat"
              onClick={beginQueue}
              loading={pending}
              disabled={missingLink || selected.size === 0}
            >
              Start sending to {selected.size}
            </Button>
            <Button variant="ghost" icon="chevron-left" onClick={() => setStep("pick")}>
              Back
            </Button>
          </div>
        </Card>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <Card>
            <div className="kicker mb-2">Preview</div>
            <div className="rounded-card bg-primary-wash p-3">
              <pre className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
                {preview}
              </pre>
            </div>
            <p className="mt-2 text-[12px] text-faint">
              Shown as {sample?.name ?? "a customer"} would see it.
            </p>
          </Card>
        </aside>
      </div>
    );
  }

  // ── Step 1: pick recipients ───────────────────────────────
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <Card className="min-w-0">
        <div className="mb-4">
          <div className="kicker mb-1">Step 1 of 3</div>
          <h2 className="text-[18px] font-bold text-ink">Who are you asking?</h2>
          <p className="mt-0.5 text-[13px] text-sub">
            Only customers with a WhatsApp-reachable number and service consent can be selected.
          </p>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            iconLeft="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or number"
            className="max-w-[260px]"
          />
          <Chip selected={includeAsked} onClick={() => setIncludeAsked((v) => !v)} icon="refresh">
            Include already asked
          </Chip>
          <Button variant="ghost" size="sm" icon="check" onClick={selectAllVisible}>
            Select all shown
          </Button>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon="users"
            title="Nobody to ask yet"
            description={
              blockedCount
                ? "Your customers are missing phone numbers or service consent. Capture those first and they'll appear here."
                : "Add customers with mobile numbers and they'll show up here."
            }
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {visible.map((candidate) => {
              const isSelected = selected.has(candidate.id);
              const blocked = Boolean(candidate.blockedReason);
              return (
                <li key={candidate.id}>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => toggle(candidate.id)}
                    aria-pressed={isSelected}
                    className={
                      "flex w-full items-center gap-3 px-1 py-3 text-left transition-colors " +
                      (blocked ? "cursor-not-allowed opacity-60" : "hover:bg-primary-wash/40")
                    }
                  >
                    <span
                      className={
                        "grid size-5 shrink-0 place-items-center rounded-[6px] border transition-colors " +
                        (isSelected
                          ? "border-primary bg-primary text-white"
                          : "border-hairline bg-card")
                      }
                      aria-hidden
                    >
                      {isSelected ? <Icon name="check" size={13} /> : null}
                    </span>
                    <span className="grid size-9 shrink-0 place-items-center rounded-chip bg-primary-tint text-[12px] font-bold text-primary-dark">
                      {initials(candidate.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink">
                        {candidate.name}
                      </span>
                      <span className="block truncate text-[13px] text-faint">
                        {candidate.blockedReason ?? candidate.phoneDisplay}
                      </span>
                    </span>
                    {candidate.alreadyAsked && !blocked ? (
                      <Badge tone="sub">Asked before</Badge>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <aside className="space-y-4 lg:sticky lg:top-6">
        <Card>
          <div className="kicker mb-2">Selected</div>
          <div className="text-[28px] font-bold tabular-nums text-ink">{selected.size}</div>
          <p className="mt-1 text-[13px] text-sub">
            {eligible.length} customer{eligible.length === 1 ? "" : "s"} available to ask.
          </p>
          <Button
            className="mt-4"
            fullWidth
            icon="arrow-right"
            disabled={selected.size === 0}
            onClick={() => setStep("compose")}
          >
            Write the message
          </Button>
          {blockedCount ? (
            <p className="mt-3 border-t border-hairline pt-3 text-[12px] text-faint">
              {blockedCount} customer{blockedCount === 1 ? " is" : "s are"} unavailable — missing a
              usable phone number or service consent.
            </p>
          ) : null}
        </Card>

        <Card>
          <div className="kicker mb-2">How this works</div>
          <ol className="space-y-2 text-[13px] text-sub">
            <li>1. Pick who you want to ask.</li>
            <li>2. Write one message — names and links fill in automatically.</li>
            <li>3. Foundly opens each chat in WhatsApp with the text ready. You press send.</li>
          </ol>
          <p className="mt-3 border-t border-hairline pt-3 text-[12px] text-faint">
            Messages come from your own WhatsApp number, so there&apos;s no Business API to apply
            for. The tradeoff: sending is one chat at a time, by you.
          </p>
        </Card>
      </aside>
    </div>
  );
}
