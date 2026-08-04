"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Chip, ProgressRail } from "@/components/ds/misc";
import { Textarea, Toggle } from "@/components/ds/form";
import { Button } from "@/components/ds/Button";
import { StarSelector } from "@/components/review/StarSelector";
import { DraftCard } from "@/components/review/DraftCard";
import { PublicGoogleReviewLink } from "@/components/review/PublicGoogleReviewLink";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { advanceRequestAction, submitPrivateFeedbackAction } from "@/lib/actions";
import type { RequestStatus } from "@/lib/data/types";

type Step = "service" | "rate" | "write" | "feedback";
type Rating = 1 | 2 | 3 | 4 | 5;

interface Draft {
  text: string;
  tone: string;
}

function Notice({ tone, icon, children }: {
  tone: "warning" | "danger";
  icon: "clock" | "alert";
  children: React.ReactNode;
}) {
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

function StepHeader({
  onBack, current, total,
}: {
  onBack: () => void; current: number; total: number;
}) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <button
        type="button"
        onClick={onBack}
        className="-mx-1 inline-flex min-h-[44px] items-center gap-1 px-1 text-[13px] font-semibold text-sub transition-all hover:text-ink active:scale-[0.98]"
      >
        <Icon name="chevron-left" size={16} /> Back
      </button>
      <ProgressRail current={current} total={total} />
    </div>
  );
}

interface ReviewFlowProps {
  token: string;
  business: string;
  category: string;
  industryKey?: string;
  service?: string;
  reviewUrl: string;
  staffName?: string;
  /** Services the owner offers — the "what did you come in for" options. */
  serviceOptions: string[];
  /** Experience chips: positive first, then neutral. */
  attributeSeeds: string[];
  initialStatus?: RequestStatus;
  initialRating?: Rating;
}

/**
 * Policy-critical customer experience.
 *
 * The customer answers three questions — which service, how it went, and what
 * stood out — and those answers are the ONLY source of the suggested wording.
 * Every draft is editable, the customer posts it themselves, and:
 * - every rating follows the same public-review path (no gating);
 * - AI never adds a service, person, claim or keyword the customer didn't pick;
 * - writing from scratch stays one tap away;
 * - private feedback is optional and never hides the Google link.
 */
export function ReviewFlow({
  token,
  business,
  service,
  reviewUrl,
  serviceOptions,
  attributeSeeds,
  initialStatus,
  initialRating,
}: ReviewFlowProps) {
  const router = useRouter();

  const services = useMemo(() => serviceOptions.slice(0, 10), [serviceOptions]);
  const chips = useMemo(() => attributeSeeds.slice(0, 10), [attributeSeeds]);
  // A workspace with no service list skips straight to the rating question
  // rather than showing an empty step.
  const hasServiceStep = services.length > 0;

  const [step, setStep] = useState<Step>(hasServiceStep ? "service" : "rate");
  const [selectedService, setSelectedService] = useState<string | undefined>(
    service && services.some((s) => s.toLowerCase() === service.toLowerCase())
      ? services.find((s) => s.toLowerCase() === service.toLowerCase())
      : undefined,
  );
  const [rating, setRating] = useState<number>(initialRating ?? 0);
  const [attributes, setAttributes] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  /** Whether a model wrote the wording or the deterministic template did. */
  const [draftSource, setDraftSource] = useState<"ai" | "template">("template");
  const [selectedDraft, setSelectedDraft] = useState(0);
  const [drafting, setDrafting] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [ownWords, setOwnWords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [canContact, setCanContact] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const totalSteps = hasServiceStep ? 3 : 2;
  const terminal =
    initialStatus === "posted_google"
      ? "posted"
      : initialStatus === "private_feedback"
        ? "private"
        : null;

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

  function toggleAttribute(chip: string) {
    setAttributes((current) =>
      current.includes(chip)
        ? current.filter((item) => item !== chip)
        : current.length >= 4
          ? current
          : [...current, chip],
    );
  }

  /**
   * Ask the server for starting-point wording built from the answers the
   * customer just gave. A failure is never fatal — the customer lands on the
   * same editor with an empty box and writes it themselves.
   */
  async function buildDrafts(value: Rating, chosenAttributes: string[]) {
    setDrafting(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/review-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          rating: value,
          attributes: chosenAttributes,
          ...(selectedService ? { service: selectedService } : {}),
        }),
      });
      if (!response.ok) throw new Error("bad_response");
      const data = await response.json() as { variants?: Draft[]; source?: "ai" | "template" };
      const variants = (data.variants ?? []).filter((item) => item?.text?.trim());
      if (!variants.length) throw new Error("no_variants");
      setDrafts(variants);
      setDraftSource(data.source === "ai" ? "ai" : "template");
      setSelectedDraft(0);
      setReviewText(variants[0]!.text);
      setOwnWords(false);
    } catch {
      // No suggestion available — the blank editor is the honest fallback.
      setDrafts([]);
      setOwnWords(true);
      setReviewText("");
    } finally {
      setDrafting(false);
    }
  }

  async function onRate(value: Rating) {
    setRating(value);
    try {
      await advanceRequestAction(token, "opened", { rating: value, attributes });
    } catch {
      // Progress analytics never blocks the customer.
    }
  }

  async function continueToWriting() {
    if (rating < 1 || rating > 5) {
      setError("Choose a rating first.");
      return;
    }
    setError(null);
    setStep("write");
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOwnWords(true);
      return;
    }
    await buildDrafts(rating as Rating, attributes);
  }

  function chooseDraft(index: number) {
    setSelectedDraft(index);
    setReviewText(drafts[index]?.text ?? "");
    setOwnWords(false);
    setEditMessage(null);
  }

  function editDraft(index: number, text: string) {
    setDrafts((current) => current.map((item, i) => (i === index ? { ...item, text } : item)));
    if (index === selectedDraft) setReviewText(text);
  }

  async function improveClarity() {
    setError(null);
    setEditMessage(null);
    if (reviewText.trim().length < 10) {
      setError("Write a little more in your own words before asking for a clarity edit.");
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("You're offline. Reconnect to use the optional clarity edit.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/ai/review-edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, text: reviewText }),
      });
      if (!response.ok) throw new Error("bad_response");
      const data = await response.json() as { suggestion?: string; changed?: boolean };
      if (!data.suggestion) throw new Error("missing_suggestion");
      setReviewText(data.suggestion);
      setEditMessage(
        data.changed
          ? "Clarity improved without adding new content. Please read it before posting."
          : "Your wording is already clear, so nothing was added or changed.",
      );
    } catch {
      setError("We couldn't check the wording just now. Your original text is unchanged.");
    } finally {
      setLoading(false);
    }
  }

  function onPublicReviewOpen() {
    const text = reviewText.trim();
    if (text) {
      void navigator.clipboard.writeText(text).then(
        () => setCopied(true),
        () => setCopied(false),
      );
    }
    if (rating >= 1 && rating <= 5) {
      void advanceRequestAction(token, "clicked", {
        rating: rating as Rating,
        attributes,
      }).catch(() => undefined);
    }
    window.setTimeout(() => router.push(`/r/${token}/thanks`), 650);
  }

  async function submitFeedback() {
    setError(null);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("You're offline. Reconnect to send your feedback.");
      return;
    }
    if (rating < 1 || rating > 5) {
      setError("Choose a rating first.");
      return;
    }
    setLoading(true);
    try {
      const note = canContact
        ? `${feedback.trim()}\n\n(I'm happy to be contacted about this.)`
        : feedback.trim();
      await submitPrivateFeedbackAction({ token, rating: rating as Rating, text: note });
      setSubmitted(true);
    } catch {
      setError("We couldn't send that just now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const firstStep: Step = hasServiceStep ? "service" : "rate";

  if (terminal === "posted" && step === firstStep) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-16 text-center animate-fade-in">
        <div className="grid size-16 place-items-center rounded-card bg-gold-tint text-gold-deep">
          <Icon name="star-fill" size={32} />
        </div>
        <h1 className="mt-5 text-[22px] font-extrabold text-ink">You&apos;ve already shared a review</h1>
        <p className="mt-2 max-w-xs text-[14px] text-sub">Thanks for supporting {business}.</p>
        <div className="mt-6 w-full">
          <PublicGoogleReviewLink reviewUrl={reviewUrl} prominent />
        </div>
      </div>
    );
  }

  if (terminal === "private" && step === firstStep && !submitted) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-14 text-center animate-fade-in">
        <div className="grid size-16 place-items-center rounded-card bg-primary-tint text-primary">
          <Icon name="check-circle" size={32} />
        </div>
        <h1 className="mt-5 text-[22px] font-extrabold text-ink">Your private feedback is already in</h1>
        <p className="mt-2 max-w-xs text-[14px] text-sub">The owner has your note. The public option remains available.</p>
        <div className="mt-6 w-full">
          <PublicGoogleReviewLink reviewUrl={reviewUrl} prominent />
        </div>
      </div>
    );
  }

  // ── Step 1: which service ─────────────────────────────────
  if (step === "service") {
    return (
      <div className="flex flex-1 flex-col py-6 animate-fade-in">
        <div className="mb-5 flex items-center justify-end">
          <ProgressRail current={0} total={totalSteps} />
        </div>
        <h1 className="text-[22px] font-extrabold leading-tight text-ink">
          What did you come to {business} for?
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-sub">{MICROCOPY.serviceStepHelp}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          {services.map((item) => (
            <Chip
              key={item}
              selected={selectedService === item}
              onClick={() => setSelectedService(selectedService === item ? undefined : item)}
            >
              {item}
            </Chip>
          ))}
        </div>

        <div className="mt-auto space-y-3 pt-8">
          <Button fullWidth size="lg" onClick={() => setStep("rate")}>
            {selectedService ? "Continue" : "Skip this"}
          </Button>
          <p className="text-center text-[11px] leading-relaxed text-faint">
            {MICROCOPY.samePathEveryRating} {MICROCOPY.noIncentive}
          </p>
        </div>
      </div>
    );
  }

  // ── Step 2: how was it + what stood out ───────────────────
  if (step === "rate") {
    return (
      <div className="flex flex-1 flex-col py-6 animate-fade-in">
        {hasServiceStep ? (
          <StepHeader onBack={() => setStep("service")} current={1} total={totalSteps} />
        ) : (
          <div className="mb-5 flex items-center justify-end">
            <ProgressRail current={0} total={totalSteps} />
          </div>
        )}
        {offline ? <Notice tone="warning" icon="clock">You&apos;re offline. You can still rate; sharing needs a connection.</Notice> : null}

        <h1 className="text-center text-[24px] font-extrabold leading-tight text-ink">
          How was your experience with {business}?
        </h1>
        {selectedService ? (
          <p className="mt-1 text-center text-[13px] font-semibold text-primary-dark">
            {selectedService}
          </p>
        ) : null}
        <p className="mt-2 text-center text-[14px] text-sub">
          Your honest feedback is welcome at every rating.
        </p>

        <div className="mt-8">
          <StarSelector value={rating} onChange={onRate} showLabel size={48} />
        </div>

        {rating > 0 && chips.length > 0 ? (
          <div className="mt-8 animate-slide-up">
            <h2 className="text-[15px] font-bold text-ink">What stood out? <span className="font-medium text-faint">(up to 4)</span></h2>
            <p className="mt-1 text-[12px] leading-relaxed text-faint">{MICROCOPY.attributeStepHelp}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <Chip
                  key={chip}
                  selected={attributes.includes(chip)}
                  disabled={!attributes.includes(chip) && attributes.length >= 4}
                  onClick={() => toggleAttribute(chip)}
                >
                  {chip}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <div className="mt-4"><Notice tone="danger" icon="alert">{error}</Notice></div> : null}

        <div className="mt-auto space-y-3 pt-8">
          <Button
            fullWidth
            size="lg"
            disabled={rating < 1}
            loading={drafting}
            onClick={continueToWriting}
          >
            Continue
          </Button>
          <p className="text-center text-[11px] leading-relaxed text-faint">
            {MICROCOPY.samePathEveryRating} {MICROCOPY.noIncentive}
          </p>
        </div>
      </div>
    );
  }

  // ── Step 3: the suggested wording, fully editable ─────────
  if (step === "write") {
    const showDrafts = drafts.length > 0 && !ownWords;
    return (
      <div className="flex flex-1 flex-col py-6">
        <StepHeader
          onBack={() => setStep("rate")}
          current={hasServiceStep ? 2 : 1}
          total={totalSteps}
        />

        <h1 className="text-[22px] font-extrabold text-ink">
          {showDrafts ? "Here's a starting point" : "Share your experience in your own words"}
        </h1>
        <p className="mt-1 text-[14px] leading-relaxed text-sub">
          {showDrafts ? MICROCOPY.draftFromYourAnswers : MICROCOPY.customerWordsOnly}
        </p>

        {drafting ? (
          <div className="mt-6 space-y-3" aria-live="polite">
            <p className="text-[13px] text-sub">Putting your answers into words…</p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer h-24 rounded-card" />
            ))}
          </div>
        ) : showDrafts ? (
          <>
            <div className="mt-5 space-y-3" role="radiogroup" aria-label="Choose a starting point">
              {drafts.map((draft, index) => (
                <DraftCard
                  key={draft.tone}
                  text={draft.text}
                  tone={draft.tone}
                  selected={selectedDraft === index}
                  onSelect={() => chooseDraft(index)}
                  onEdit={(value) => editDraft(index, value)}
                />
              ))}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-faint">
              {draftSource === "ai" ? MICROCOPY.aiDraftDisclaimer : MICROCOPY.draftTemplateDisclaimer}{" "}
              {MICROCOPY.draftEditBeforePosting}
            </p>
            <button
              type="button"
              onClick={() => { setOwnWords(true); setReviewText(""); setEditMessage(null); }}
              className="mt-3 min-h-[44px] self-start text-[13px] font-semibold text-primary underline underline-offset-2"
            >
              {MICROCOPY.draftWriteMyOwn} Write my own
            </button>
          </>
        ) : (
          <>
            <div className="mt-5">
              <Textarea
                value={reviewText}
                onChange={(event) => {
                  setReviewText(event.target.value.slice(0, 2_000));
                  setEditMessage(null);
                }}
                placeholder="What happened during your experience, and what would be useful for another customer to know?"
                rows={7}
                aria-label="Your Google review in your own words"
              />
              <div className="mt-2 flex items-start justify-between gap-4">
                <p className="text-[11px] leading-relaxed text-faint">{MICROCOPY.aiReviewEditDisclaimer}</p>
                <span className="shrink-0 text-[11px] tabular-nums text-faint">{reviewText.length}/2000</span>
              </div>
            </div>

            <Button
              className="mt-4 self-start"
              variant="secondary"
              size="sm"
              icon="sparkles"
              onClick={improveClarity}
              loading={loading}
              disabled={reviewText.trim().length < 10}
            >
              Improve clarity only
            </Button>

            {drafts.length > 0 ? (
              <button
                type="button"
                onClick={() => { setOwnWords(false); setReviewText(drafts[selectedDraft]?.text ?? ""); }}
                className="mt-3 min-h-[44px] self-start text-[13px] font-semibold text-primary underline underline-offset-2"
              >
                Show the suggested wording again
              </button>
            ) : null}
          </>
        )}

        {editMessage ? (
          <p role="status" className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-primary-dark">
            <Icon name="check-circle" size={15} className="mt-px shrink-0" /> {editMessage}
          </p>
        ) : null}
        {error ? <div className="mt-4"><Notice tone="danger" icon="alert">{error}</Notice></div> : null}
        {copied ? (
          <p role="status" className="mt-4 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-primary">
            <Icon name="check-circle" size={16} /> Your words were copied before Google opened.
          </p>
        ) : null}

        <div className="mt-auto space-y-3 pt-6">
          <PublicGoogleReviewLink
            reviewUrl={reviewUrl}
            prominent
            label={reviewText.trim() ? "Copy my words & open Google" : "Open Google to write my review"}
            onBeforeOpen={onPublicReviewOpen}
          />
          <Button variant="ghost" fullWidth onClick={() => setStep("feedback")}>Send private feedback instead</Button>
          <p className="text-center text-[11px] leading-relaxed text-faint">
            {MICROCOPY.samePathEveryRating} {MICROCOPY.noIncentive}
          </p>
        </div>
      </div>
    );
  }

  // ── Private feedback branch ───────────────────────────────
  return (
    <div className="flex flex-1 flex-col py-6">
      {submitted ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center animate-slide-up">
          <div className="grid size-16 place-items-center rounded-card bg-primary-tint text-primary">
            <Icon name="check-circle" size={32} />
          </div>
          <h1 className="mt-4 text-[22px] font-extrabold text-ink">Thank you - the owner will see this</h1>
          <p className="mt-1 text-[14px] text-sub">Your private note does not prevent you from reviewing publicly.</p>
          <div className="mt-6 w-full">
            <PublicGoogleReviewLink reviewUrl={reviewUrl} prominent />
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setStep("write")}
            className="-mx-1 mb-4 inline-flex min-h-[44px] items-center gap-1 self-start px-1 text-[13px] font-semibold text-sub transition-all hover:text-ink active:scale-[0.98]"
          >
            <Icon name="chevron-left" size={16} /> Back
          </button>
          <h1 className="text-[22px] font-extrabold leading-tight text-ink">Send a private note to the owner</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-sub">
            This is optional and does not replace or hide the public Google review option.
          </p>
          <div className="mt-4">
            <Textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value.slice(0, 4_000))}
              placeholder="What would you like the owner to know?"
              rows={5}
              aria-label="Your private feedback"
            />
          </div>

          <div className="mt-6 flex items-start justify-between gap-3 rounded-card border border-hairline bg-card p-4">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-ink">The owner can contact me</div>
              <div className="mt-0.5 text-[12px] leading-relaxed text-faint">Optional - so they can follow up.</div>
            </div>
            <Toggle checked={canContact} onChange={setCanContact} label="Allow the owner to contact me" />
          </div>

          {error ? <div className="mt-4"><Notice tone="danger" icon="alert">{error}</Notice></div> : null}
          <Button className="mt-6" onClick={submitFeedback} loading={loading} disabled={!feedback.trim()} fullWidth size="lg" icon="send">
            Send private feedback
          </Button>
          <div className="mt-5">
            <PublicGoogleReviewLink reviewUrl={reviewUrl} />
          </div>
        </>
      )}
    </div>
  );
}
