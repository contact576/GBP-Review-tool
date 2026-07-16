"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { Field, Input, Checkbox, Chip, useToast } from "@/components/ds";
import { MegaCTA } from "@/components/review/MegaCTA";
import { captureCustomerAction } from "@/lib/actions";
import { consentLabels, makeConsentSourceText } from "@/lib/compliance/consent";
import type { Region } from "@/lib/data/types";
import type { CaptureCustomerInput } from "@/lib/data/provider";

type ChannelChoice = "email" | "sms";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Inline contact validation — returns a reason string, or null when acceptable. */
function validateContact(channel: ChannelChoice, value: string): string | null {
  const v = value.trim();
  if (!v) return null; // empty is handled by the disabled state, not an inline error
  if (channel === "email") return EMAIL_RE.test(v) ? null : "Enter a valid email address.";
  const digits = v.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? null : "Enter a valid phone number.";
}

export function CaptureForm({
  locationId,
  region,
  staffId,
  attributeSeeds,
  rank,
  totalStaff,
}: {
  locationId: string;
  region: Region;
  staffId: string;
  attributeSeeds: string[];
  rank: number;
  totalStaff: number;
}) {
  const labels = consentLabels(region);
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [channel, setChannel] = useState<ChannelChoice>("email");
  const [contact, setContact] = useState("");
  const [contactTouched, setContactTouched] = useState(false);
  const [selectedAttrs, setSelectedAttrs] = useState<string[]>([]);
  const [serviceConsent, setServiceConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [tally, setTally] = useState(0);
  const [sentTo, setSentTo] = useState<{ name: string; mode: "sent" | "queued" } | null>(null);
  const [offline, setOffline] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const queueRef = useRef<CaptureCustomerInput[]>([]);

  const nameOk = name.trim().length > 0;
  const contactFilled = contact.trim().length > 0;
  const contactErr = contactTouched ? validateContact(channel, contact) : null;
  const contactOk = contactFilled && !validateContact(channel, contact);
  const canSend = nameOk && contactOk && serviceConsent && !pending;

  // Flush any queued captures when connectivity returns.
  useEffect(() => {
    async function drain() {
      if (!navigator.onLine || queueRef.current.length === 0) return;
      const items = queueRef.current;
      queueRef.current = [];
      setQueueCount(0);
      const failed: CaptureCustomerInput[] = [];
      for (const p of items) {
        try { await captureCustomerAction(p); } catch { failed.push(p); }
      }
      if (failed.length) {
        queueRef.current = failed;
        setQueueCount(failed.length);
      } else {
        toast("Queued invites sent", "success", "check-circle");
      }
    }
    const onOnline = () => { setOffline(false); void drain(); };
    const onOffline = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [toast]);

  function toggleAttr(a: string) {
    setSelectedAttrs((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  function resetForm() {
    setName("");
    setChannel("email");
    setContact("");
    setContactTouched(false);
    setSelectedAttrs([]);
    setServiceConsent(false);
    setMarketingConsent(false);
  }

  function enqueue(p: CaptureCustomerInput) {
    queueRef.current = [...queueRef.current, p];
    setQueueCount(queueRef.current.length);
  }

  function flashSuccess(customerName: string, mode: "sent" | "queued") {
    resetForm();
    setSentTo({ name: customerName, mode });
    setTimeout(() => setSentTo(null), 1600);
  }

  function onSend() {
    const customerName = name.trim();
    if (!customerName) return;
    setContactTouched(true);
    if (!contactOk) return; // empty or invalid contact — inline error already shows

    // Dual-consent guard: service consent is legally required to send anything.
    if (!serviceConsent) {
      toast("Tick the service-consent box before sending", "warning", "shield");
      return;
    }

    const payload: CaptureCustomerInput = {
      locationId,
      name: customerName,
      email: channel === "email" ? contact.trim() : undefined,
      phone: channel === "sms" ? contact.trim() : undefined,
      staffId,
      channel,
      services: selectedAttrs,
      serviceConsent,
      marketingConsent,
      consentSourceText: makeConsentSourceText(region, marketingConsent),
    };

    // Optimistic tally — this customer is captured the moment the desk taps send.
    setTally((t) => t + 1);

    // Offline: keep the capture and send it when the connection returns.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      enqueue(payload);
      toast(`Saved — sends to ${customerName} when you're back online`, "info", "clock");
      flashSuccess(customerName, "queued");
      return;
    }

    startTransition(async () => {
      try {
        await captureCustomerAction(payload);
        toast(`Invite sent to ${customerName}`, "success", "check-circle");
        flashSuccess(customerName, "sent");
      } catch {
        // Network dropped mid-send — never lose the capture.
        enqueue(payload);
        toast(`Saved — we'll retry ${customerName} shortly`, "warning", "clock");
        flashSuccess(customerName, "queued");
      }
    });
  }

  return (
    <div className="relative">
      {/* Big success moment (1.6s), then the form is already reset behind it. */}
      {sentTo ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-paper px-6 text-center animate-fade-in">
          <div
            className={cn(
              "grid size-24 place-items-center rounded-full animate-slide-up",
              sentTo.mode === "sent" ? "bg-primary-tint text-primary" : "bg-gold-tint text-gold-deep",
            )}
          >
            <Icon name={sentTo.mode === "sent" ? "check-circle" : "clock"} size={56} />
          </div>
          <div>
            <div className="text-[24px] font-extrabold text-ink">
              {sentTo.mode === "sent" ? `Sent to ${sentTo.name}` : `Saved for ${sentTo.name}`}
            </div>
            <p className="mt-1 text-[14px] text-sub">
              {sentTo.mode === "sent" ? "Ready for the next one." : "Sends automatically when you're back online."}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[540px] px-4 pb-44 pt-4">
        {/* Stats strip */}
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-card border border-hairline bg-card px-3 py-2 shadow-sm">
            <span className="grid size-8 place-items-center rounded-chip bg-primary-tint text-primary-dark">
              <Icon name="check" size={16} />
            </span>
            <div className="leading-tight">
              <div className="text-[16px] font-extrabold tabular-nums text-ink">{tally}</div>
              <div className="text-[11px] text-faint">captured today</div>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-2 rounded-card border border-hairline bg-card px-3 py-2 shadow-sm">
            <span className="grid size-8 place-items-center rounded-chip bg-gold-tint text-gold-deep">
              <Icon name="trophy" size={16} />
            </span>
            <div className="leading-tight">
              <div className="text-[16px] font-extrabold tabular-nums text-ink">
                #{rank}
                <span className="text-[12px] font-medium text-faint"> / {totalStaff}</span>
              </div>
              <div className="text-[11px] text-faint">my rank</div>
            </div>
          </div>
          <Link
            href="/staff/qr"
            className="grid min-h-[44px] place-items-center rounded-card border border-hairline bg-card px-3 text-primary shadow-sm transition-colors hover:bg-primary-wash"
            aria-label="Show kiosk QR"
          >
            <Icon name="qr" size={20} />
          </Link>
        </div>

        {/* Offline / queue status — honest, never a dead end */}
        {offline ? (
          <div className="mt-3 flex items-start gap-2 rounded-btn border border-gold/40 bg-gold-tint px-3 py-2.5 text-[13px] font-medium text-gold-deep">
            <Icon name="clock" size={16} className="mt-px shrink-0" />
            You&apos;re offline — captures are saved and send automatically when you reconnect.
          </div>
        ) : queueCount > 0 ? (
          <div className="mt-3 flex items-center gap-2 rounded-btn border border-hairline bg-card px-3 py-2 text-[12px] font-medium text-sub">
            <Icon name="clock" size={14} className="shrink-0 text-gold-deep" />
            {queueCount} waiting to send — retrying automatically.
          </div>
        ) : null}

        {/* Name */}
        <div className="mt-6">
          <label htmlFor="cust-name" className="block text-[20px] font-extrabold text-ink">
            Who did you just help?
          </label>
          <Input
            id="cust-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Their first name"
            autoComplete="off"
            enterKeyHint="next"
            className="mt-2 h-14 text-[16px]"
          />
        </div>

        {/* Channel */}
        <div className="mt-5">
          <span className="mb-1.5 block text-[13px] font-semibold text-ink">How should we reach them?</span>
          <div className="flex gap-2 rounded-input border border-hairline bg-card p-1">
            {(
              [
                { key: "email", label: "Email", icon: "mail" },
                { key: "sms", label: "SMS", icon: "message" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                aria-pressed={channel === opt.key}
                onClick={() => { setChannel(opt.key); setContactTouched(false); }}
                className={cn(
                  "flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[10px] text-[14px] font-semibold transition-colors",
                  channel === opt.key ? "bg-primary text-white shadow-sm" : "text-sub hover:text-ink",
                )}
              >
                <Icon name={opt.icon} size={16} />
                {opt.label}
              </button>
            ))}
          </div>
          {channel === "sms" ? (
            <p className="mt-1.5 flex items-center gap-1 text-[12px] text-gold-deep">
              <Icon name="clock" size={12} /> SMS is pending A2P registration — selectable in demo.
            </p>
          ) : null}
        </div>

        {/* Contact */}
        <div className="mt-4">
          <Field label={channel === "email" ? "Their email" : "Their mobile number"} error={contactErr ?? undefined}>
            <Input
              type={channel === "email" ? "email" : "tel"}
              inputMode={channel === "email" ? "email" : "tel"}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              onBlur={() => setContactTouched(true)}
              invalid={Boolean(contactErr)}
              placeholder={channel === "email" ? "name@email.com" : "(555) 123-4567"}
              autoComplete="off"
              enterKeyHint="done"
              iconLeft={channel === "email" ? "mail" : "phone"}
            />
          </Field>
        </div>

        {/* Attributes */}
        <div className="mt-5">
          <span className="mb-2 block text-[13px] font-semibold text-ink">
            What went well? <span className="font-normal text-faint">(optional)</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {attributeSeeds.map((a) => (
              <Chip key={a} selected={selectedAttrs.includes(a)} onClick={() => toggleAttr(a)}>
                {a}
              </Chip>
            ))}
          </div>
        </div>

        {/* Dual consent */}
        <div className="mt-6 space-y-3 rounded-card border border-hairline bg-primary-wash/50 p-4">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-sub">
            <Icon name="shield" size={14} /> Consent captured in person
          </div>
          <Checkbox
            checked={serviceConsent}
            onChange={setServiceConsent}
            label={
              <span>
                {labels.service} <span className="font-semibold text-danger">Required</span>
              </span>
            }
          />
          <Checkbox checked={marketingConsent} onChange={setMarketingConsent} label={labels.marketing} />
          {labels.casl ? (
            <p className="flex items-start gap-1.5 border-t border-hairline pt-2 text-[12px] text-faint">
              <Icon name="flag" size={13} className="mt-0.5 shrink-0" />
              {labels.casl}
            </p>
          ) : null}
        </div>
      </div>

      {/* Fixed CTA, lifted above the tab row */}
      <div className="fixed inset-x-0 bottom-[60px] z-20">
        <div className="mx-auto w-full max-w-[540px] bg-gradient-to-t from-paper via-paper to-transparent px-4 pb-3 pt-5">
          {nameOk && contactOk && !serviceConsent ? (
            <p className="mb-2 flex items-center justify-center gap-1 text-center text-[12px] font-medium text-danger">
              <Icon name="shield" size={13} /> Service consent is required before you can send.
            </p>
          ) : null}
          <MegaCTA
            label={pending ? "Sending…" : offline ? "Save invite" : "Send review invite"}
            icon={offline ? "clock" : "send"}
            onClick={onSend}
            disabled={!canSend}
            loading={pending}
            sticky={false}
          />
        </div>
      </div>
    </div>
  );
}
