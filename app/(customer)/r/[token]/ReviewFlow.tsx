"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Chip, ProgressRail } from "@/components/ds/misc";
import { Textarea, Toggle } from "@/components/ds/form";
import { Button } from "@/components/ds/Button";
import { StarSelector } from "@/components/review/StarSelector";
import { DraftCard } from "@/components/review/DraftCard";
import { MegaCTA } from "@/components/review/MegaCTA";
import { PublicGoogleReviewLink } from "@/components/review/PublicGoogleReviewLink";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { advanceRequestAction, submitPrivateFeedbackAction } from "@/lib/actions";
import type { DraftVariant, RequestStatus } from "@/lib/data/types";

type Step = "rate" | "attributes" | "drafts" | "feedback";

/** Slim status bar for offline / error states — keeps the flow honest, no dead ends. */
function Notice({ tone, icon, children }: { tone: "warning" | "danger"; icon: "clock" | "alert"; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={
        tone === "warning"
          ? "mb-4 flex items-start gap-2 rounded-btn border border-gold/40 bg-gold-tint px-3 py-2.5 text-[13px] font-medium text-gold-deep"
          : "mb-4 flex items-start gap-2 rounded-btn border border-danger/30 bg-danger-tint px-3 py-2.5 text-[13px] font-medium text-danger"
      }
    >
      <Icon name={icon} size={16} className="mt-px shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function ReviewFlow({
  token, business, category, industryKey, service, reviewUrl, staffName, attributeSeeds,
  initialStatus, initialRating,
}: {
  token: string; business: string; category: string; industryKey?: string; service?: string;
  reviewUrl: string; staffName?: string; attributeSeeds: string[];
  initialStatus?: RequestStatus; initialRating?: 1 | 2 | 3 | 4 | 5;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("rate");
  const [rating, setRating] = useState(0);
  const [selectedAttrs, setSelectedAttrs] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<DraftVariant[]>([]);
  const [chosen, setChosen] = useState(0);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [canContact, setCanContact] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  // Terminal state when this review link has already been used.
  const terminal =
    initialStatus === "posted_google" ? "posted" : initialStatus === "private_feedback" ? "private" : null;

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  async function onRate(v: 1 | 2 | 3 | 4 | 5) {
    setRating(v);
    // Advancing is analytics only — never let a flaky network block the flow.
    try { await advanceRequestAction(token, "opened", { rating: v }); } catch { /* non-blocking */ }
    if (v >= 4) setStep("attributes");
    else setStep("feedback");
  }

  function toggleAttr(a: string) {
    setSelectedAttrs((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  async function generate() {
    setError(null);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("You're offline. Reconnect to draft your review.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ai/review-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ business, category, industryKey, service, rating, attributes: selectedAttrs, staffName }),
      });
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      const variants: DraftVariant[] = data.variants ?? [];
      if (variants.length === 0) throw new Error("no variants");
      setDrafts(variants);
      setChosen(0);
      setStep("drafts");
    } catch {
      setError("We couldn't draft a review just now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copyAndOpen() {
    if (copied) return;
    const text = drafts[chosen]?.text ?? "";
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be blocked */ }
    setCopied(true);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("You're offline. Your review is copied — reconnect to post it on Google.");
      setCopied(false);
      return;
    }
    try {
      await advanceRequestAction(token, "posted_google", { rating: rating as 4 | 5, attributes: selectedAttrs });
    } catch { /* non-blocking */ }
    window.open(reviewUrl, "_blank", "noopener");
    // Let the "Copied" confirmation land before handing off to the thank-you screen.
    setTimeout(() => router.push(`/r/${token}/thanks`), 650);
  }

  async function submitFeedback() {
    setError(null);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("You're offline. Reconnect to send your feedback.");
      return;
    }
    setLoading(true);
    try {
      const note = canContact ? `${feedback.trim()}\n\n(I'm happy to be contacted about this.)` : feedback.trim();
      await submitPrivateFeedbackAction({ token, rating: rating as 1 | 2 | 3, text: note });
      setSubmitted(true);
    } catch {
      setError("We couldn't send that just now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Already used (link opened again after completing) ──────
  if (terminal === "posted" && step === "rate") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-16 text-center animate-fade-in">
        <div className="grid size-16 place-items-center rounded-card bg-gold-tint text-gold-deep">
          <Icon name="star-fill" size={32} />
        </div>
        <h1 className="mt-5 text-[22px] font-extrabold text-ink">You&apos;ve already shared a review</h1>
        <p className="mt-2 max-w-xs text-[14px] text-sub">Thanks for supporting {business} — nothing more is needed.</p>
        <a
          href={reviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-btn border border-hairline bg-card px-5 py-3 text-[14px] font-semibold text-ink transition-colors hover:bg-primary-wash"
        >
          <Icon name="google" size={18} /> View on Google <Icon name="external" size={15} className="text-faint" />
        </a>
      </div>
    );
  }

  if (terminal === "private" && step === "rate" && !submitted) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-14 text-center animate-fade-in">
        <div className="grid size-16 place-items-center rounded-card bg-primary-tint text-primary">
          <Icon name="check-circle" size={32} />
        </div>
        <h1 className="mt-5 text-[22px] font-extrabold text-ink">Your feedback is already in</h1>
        <p className="mt-2 max-w-xs text-[14px] text-sub">The owner has your note. You can still post publicly if you&apos;d like.</p>
        <div className="mt-6 w-full">
          <PublicGoogleReviewLink reviewUrl={reviewUrl} prominent />
        </div>
      </div>
    );
  }

  // ── Rate ──────────────────────────────────────────────────
  if (step === "rate") {
    return (
      <div className="flex flex-1 flex-col justify-center py-10 animate-fade-in">
        {offline ? <Notice tone="warning" icon="clock">You&apos;re offline. You can still rate — posting needs a connection.</Notice> : null}
        <h1 className="text-center text-[24px] font-extrabold leading-tight text-ink">
          How was your visit to {business}?
        </h1>
        <p className="mt-2 text-center text-[14px] text-sub">
          {staffName ? `${staffName} would love your feedback. ` : ""}It takes about 30 seconds.
        </p>
        <div className="mt-10">
          <StarSelector value={rating} onChange={onRate} showLabel size={52} />
        </div>
      </div>
    );
  }

  // ── Attributes (4–5★) ─────────────────────────────────────
  if (step === "attributes") {
    return (
      <div className="flex flex-1 flex-col py-6">
        <div className="mb-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep("rate")}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-sub transition-colors hover:text-ink"
          >
            <Icon name="chevron-left" size={16} /> Back
          </button>
          <ProgressRail current={1} total={3} />
        </div>
        <h1 className="text-[22px] font-extrabold text-ink">What did you love?</h1>
        <p className="mt-1 text-[14px] text-sub">Pick a couple — we&apos;ll turn them into a review you can edit.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {attributeSeeds.map((a) => (
            <Chip key={a} selected={selectedAttrs.includes(a)} onClick={() => toggleAttr(a)} className="justify-center">
              {a}
            </Chip>
          ))}
        </div>
        {error ? <div className="mt-5"><Notice tone="danger" icon="alert">{error}</Notice></div> : null}
        <div className="mt-auto pt-6">
          <MegaCTA
            label={selectedAttrs.length === 0 ? "Pick at least one" : "Write my review"}
            icon="sparkles"
            onClick={generate}
            loading={loading}
            disabled={selectedAttrs.length === 0}
          />
        </div>
      </div>
    );
  }

  // ── Drafts (4–5★) ─────────────────────────────────────────
  if (step === "drafts") {
    return (
      <div className="flex flex-1 flex-col py-6">
        <div className="mb-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setStep("attributes"); setCopied(false); }}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-sub transition-colors hover:text-ink"
          >
            <Icon name="chevron-left" size={16} /> Back
          </button>
          <ProgressRail current={2} total={3} />
        </div>
        <h1 className="text-[22px] font-extrabold text-ink">Pick your favourite</h1>
        <p className="mt-1 text-[13px] text-sub">{MICROCOPY.aiDraftDisclaimer}</p>
        <div className="mt-4 space-y-3" role="radiogroup" aria-label="Choose a review draft">
          {drafts.map((d, i) => (
            <DraftCard
              key={i}
              text={d.text}
              tone={d.tone}
              selected={chosen === i}
              onSelect={() => setChosen(i)}
              onEdit={(v) => setDrafts((prev) => prev.map((x, xi) => (xi === i ? { ...x, text: v } : x)))}
              onRegenerate={generate}
              regenerating={loading}
            />
          ))}
        </div>
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" icon="refresh" onClick={generate} loading={loading}>
            Try different wording
          </Button>
        </div>
        <p className="mt-2 text-center text-[11px] text-faint">{MICROCOPY.noIncentive}</p>
        {error ? <div className="mt-4"><Notice tone="danger" icon="alert">{error}</Notice></div> : null}
        {copied ? (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-primary animate-fade-in">
            <Icon name="check-circle" size={16} /> Copied — opening Google…
          </p>
        ) : null}
        <div className="mt-auto pt-4">
          <MegaCTA
            label={copied ? "Copied — opening Google" : "Copy & open Google"}
            icon={copied ? "check" : "google"}
            onClick={copyAndOpen}
            disabled={copied}
          />
        </div>
      </div>
    );
  }

  // ── Private feedback (1–3★) — public link ALWAYS visible ───
  return (
    <div className="flex flex-1 flex-col py-6">
      {submitted ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center animate-slide-up">
          <div className="grid size-16 place-items-center rounded-card bg-primary-tint text-primary">
            <Icon name="check-circle" size={32} />
          </div>
          <h1 className="mt-4 text-[22px] font-extrabold text-ink">Thank you — the owner will see this</h1>
          <p className="mt-1 text-[14px] text-sub">We appreciate you helping {business} improve.</p>
          <div className="mt-6 w-full">
            <PublicGoogleReviewLink reviewUrl={reviewUrl} prominent />
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setStep("rate")}
            className="mb-5 inline-flex items-center gap-1 self-start text-[13px] font-semibold text-sub transition-colors hover:text-ink"
          >
            <Icon name="chevron-left" size={16} /> Back
          </button>
          <h1 className="text-[22px] font-extrabold leading-tight text-ink">{MICROCOPY.privateFeedbackHeader}</h1>
          <p className="mt-1 text-[13px] text-sub">{MICROCOPY.privateFeedbackReassure}</p>
          <div className="mt-4">
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What happened? The more detail, the better we can fix it."
              rows={5}
              aria-label="Your private feedback"
            />
          </div>

          <div className="mt-4 flex items-start justify-between gap-3 rounded-card border border-hairline bg-card p-4">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-ink">The owner can contact me</div>
              <div className="text-[12px] text-faint">Optional — so they can make it right.</div>
            </div>
            <Toggle checked={canContact} onChange={setCanContact} label="Allow the owner to contact me" />
          </div>

          {error ? <div className="mt-4"><Notice tone="danger" icon="alert">{error}</Notice></div> : null}

          <Button className="mt-4" onClick={submitFeedback} loading={loading} disabled={!feedback.trim()} fullWidth size="lg" icon="send">
            Send private feedback
          </Button>

          {/* COMPLIANCE: the public Google link is ALWAYS rendered here, never gated. */}
          <div className="mt-5">
            <PublicGoogleReviewLink reviewUrl={reviewUrl} />
          </div>
        </>
      )}
    </div>
  );
}
