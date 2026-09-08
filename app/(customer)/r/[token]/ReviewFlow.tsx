"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";
import { Chip } from "@/components/ds/misc";
import { Textarea, Toggle } from "@/components/ds/form";
import { Button } from "@/components/ds/Button";
import { StarSelector } from "@/components/review/StarSelector";
import { DraftCard } from "@/components/review/DraftCard";
import { PublicGoogleReviewLink } from "@/components/review/PublicGoogleReviewLink";
import { PostingSteps } from "@/components/review/PostingSteps";
import { HowToPostSheet } from "@/components/review/HowToPostSheet";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { positiveChipsForService } from "@/lib/industries/service-attributes";
import { advanceRequestAction, submitPrivateFeedbackAction } from "@/lib/actions";
import type { RequestStatus } from "@/lib/data/types";
import type { ServiceOptionSource } from "@/lib/industries";

type Step = "welcome" | "service" | "rate" | "write" | "feedback";
type Rating = 1 | 2 | 3 | 4 | 5;

interface Draft {
  text: string;
  tone: string;
}

/** Where the thank-you page reads the customer's wording back from. */
export function reviewHandoffKey(token: string): string {
  return `foundly.review.${token}`;
}

/**
 * States in which the customer has already acted: they rated (which is what
 * writes `clicked`), posted, or sent private feedback. Delivery states —
 * including `opened`, which a QR scan sets the moment the code is resolved —
 * say nothing about whether a person has seen the flow yet.
 */
const ACTED_STATUSES: ReadonlySet<RequestStatus> = new Set<RequestStatus>([
  "clicked",
  "posted_google",
  "private_feedback",
]);

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

/**
 * Labelled progress: dots the customer can count, plus "Step 2 of 3 · How it
 * went" so the step is named, not just numbered.
 */
function StepProgress({
  current,
  labels,
  onBack,
}: {
  /** 0-based index of the current step. */
  current: number;
  labels: readonly string[];
  onBack?: () => void;
}) {
  const total = labels.length;
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="-mx-1 inline-flex min-h-[44px] items-center gap-1 px-1 text-[13px] font-semibold text-sub transition-all hover:text-ink active:scale-[0.98]"
          >
            <Icon name="chevron-left" size={16} /> Back
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1.5" aria-hidden>
          {labels.map((label, index) => (
            <span
              key={label}
              className={cn(
                "h-1.5 rounded-full transition-all duration-250",
                index < current ? "w-6 bg-primary" : index === current ? "w-6 bg-primary/50" : "w-3 bg-hairline",
              )}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 data-chip text-faint" aria-live="polite">
        Step <span className="tabular-nums">{current + 1}</span> of <span className="tabular-nums">{total}</span>
        {" · "}
        <span className="text-sub">{labels[current]}</span>
      </div>
    </div>
  );
}

/** One small "how to use this screen" hint row. */
function Hint({ icon, children, className }: { icon: IconName; children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-[12px] leading-relaxed text-sub", className)}>
      <Icon name={icon} size={14} className="mt-0.5 shrink-0 text-primary" />
      <span>{children}</span>
    </p>
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
  /** Services the business offers — the "what did you come in for" options. */
  serviceOptions: string[];
  /** Where those options came from, so the customer knows the list is real. */
  serviceOptionsSource?: ServiceOptionSource;
  /** The industry's positive experience chips (service-specific ones go in front). */
  positiveSeeds: string[];
  /** Neutral/experience chips ("First visit", "Regular here"). */
  neutralSeeds: string[];
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
 *
 * The welcome screen exists because a QR scan used to drop people straight
 * onto a question with no idea how long this takes or what happens at the
 * end. It sets expectations and hands off to the same steps as before; the
 * public Google link is on it too, so it is not a gate.
 */
export function ReviewFlow({
  token,
  business,
  service,
  reviewUrl,
  staffName,
  serviceOptions,
  serviceOptionsSource,
  positiveSeeds,
  neutralSeeds,
  initialStatus,
  initialRating,
}: ReviewFlowProps) {
  const router = useRouter();

  const services = useMemo(() => serviceOptions.slice(0, 10), [serviceOptions]);
  // A workspace with no service list skips straight to the rating question
  // rather than showing an empty step.
  const hasServiceStep = services.length > 0;
  const stepLabels = useMemo(
    () => (hasServiceStep ? ["What you came for", "How it went", "Your words"] : ["How it went", "Your words"]),
    [hasServiceStep],
  );
  const firstStep: Step = hasServiceStep ? "service" : "rate";
  // A customer who has not yet rated gets the welcome; a returning customer
  // (they rated, then came back) lands on the first real step.
  const fresh = !initialRating && !(initialStatus && ACTED_STATUSES.has(initialStatus));

  const [step, setStep] = useState<Step>(fresh ? "welcome" : firstStep);
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
  const [howToOpen, setHowToOpen] = useState(false);
  const [coachDismissed, setCoachDismissed] = useState(false);
  /**
   * Set when the customer chooses their own words while drafts are still
   * loading, so the drafts arriving later never overwrite that choice.
   */
  const ownWordsRef = useRef(false);

  /**
   * Experience chips tuned to the service the customer picked: chips that
   * describe that kind of work first, then the industry's own, then neutral.
   * Recomputed whenever the service changes, so going back and picking a
   * different service changes what stands out. Picked chips that no longer
   * appear are dropped so nothing invisible can reach the draft.
   */
  const chips = useMemo(() => {
    const positive = positiveChipsForService(selectedService, positiveSeeds);
    const seen = new Set(positive.map((chip) => chip.toLowerCase()));
    const neutral = neutralSeeds.filter((chip) => !seen.has(chip.toLowerCase()));
    return [...positive, ...neutral].slice(0, 12);
  }, [selectedService, positiveSeeds, neutralSeeds]);

  useEffect(() => {
    setAttributes((current) => current.filter((chip) => chips.includes(chip)));
  }, [chips]);

  /**
   * The customer's own answers, echoed back before they read a draft. Seeing
   * exactly what the wording is grounded in is what makes "we only used what
   * you told us" checkable rather than a promise.
   */
  const picked = useMemo(() => {
    const rows: { label: string; value: string }[] = [];
    if (selectedService) rows.push({ label: "You came in for", value: selectedService });
    if (rating >= 1 && rating <= 5) {
      rows.push({ label: "You rated it", value: `${rating} out of 5` });
    }
    if (attributes.length > 0) {
      rows.push({ label: "You picked out", value: attributes.join(", ") });
    }
    return rows;
  }, [selectedService, rating, attributes]);

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

  useEffect(() => {
    try {
      setCoachDismissed(window.sessionStorage.getItem("foundly.coach.write") === "1");
    } catch {
      // Storage unavailable — the coach simply shows.
    }
  }, []);

  function dismissCoach() {
    setCoachDismissed(true);
    try {
      window.sessionStorage.setItem("foundly.coach.write", "1");
    } catch {
      // Best-effort only.
    }
  }

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
    ownWordsRef.current = false;
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
      // The customer may have started typing their own words while these
      // loaded; the drafts stay available but never replace what they chose.
      if (!ownWordsRef.current) {
        setReviewText(variants[0]!.text);
        setOwnWords(false);
      }
    } catch {
      // No suggestion available — the blank editor is the honest fallback.
      setDrafts([]);
      setOwnWords(true);
      if (!ownWordsRef.current) setReviewText("");
    } finally {
      setDrafting(false);
    }
  }

  async function onRate(value: Rating) {
    setRating(value);
    setError(null);
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
    ownWordsRef.current = false;
    setSelectedDraft(index);
    setReviewText(drafts[index]?.text ?? "");
    setOwnWords(false);
    setEditMessage(null);
  }

  /** Switch to the blank editor — available even while suggestions are still loading. */
  function writeMyOwn() {
    ownWordsRef.current = true;
    setOwnWords(true);
    setReviewText("");
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
    // Hand the wording to the thank-you page so it can show it back and offer
    // "copy again" — clipboard writes are easy to lose between tabs.
    try {
      window.sessionStorage.setItem(
        reviewHandoffKey(token),
        JSON.stringify({ text, rating: rating >= 1 ? rating : null }),
      );
    } catch {
      // Best-effort only.
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

  const trustLine = (
    <p className="text-center text-[11px] leading-relaxed text-faint">
      {MICROCOPY.samePathEveryRating} {MICROCOPY.noIncentive}
    </p>
  );

  if (terminal === "posted" && (step === firstStep || step === "welcome")) {
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

  if (terminal === "private" && (step === firstStep || step === "welcome") && !submitted) {
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

  // ── Step 0: welcome — what this is, how long it takes, what happens ──
  if (step === "welcome") {
    const preview: { icon: IconName; title: string; body: string }[] = [
      ...(hasServiceStep
        ? [{ icon: "grid" as IconName, title: "Tell us what you came in for", body: "One tap. It only shapes the wording we suggest." }]
        : []),
      { icon: "star", title: "Rate it and tap what stood out", body: "Any rating is welcome — good, bad or in between." },
      { icon: "google", title: "Post it on Google", body: "We suggest wording from your answers. You edit it and press Post yourself." },
    ];
    return (
      <div className="flex flex-1 flex-col py-6 animate-fade-in">
        <div className="rounded-card bg-hero p-5 text-white shadow-lg on-hero">
          <div className="flex items-center gap-2 text-gold">
            <Icon name="clock" size={15} />
            <span className="data-chip text-gold">About a minute</span>
          </div>
          <h1 className="mt-3 text-[24px] font-extrabold leading-tight tracking-tight">
            Thanks for choosing {business}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-white/80">
            Tell them how it went. Your words help the next person decide, and the owner reads every one.
          </p>
          {staffName ? (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-chip bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-white">
              <Icon name="users" size={13} className="text-gold" /> {staffName} helped you today
            </div>
          ) : null}
        </div>

        <ol className="mt-5 space-y-2.5" aria-label="How this works">
          {preview.map((item, index) => (
            <li key={item.title} className="flex items-start gap-3 rounded-card border border-hairline bg-card px-3.5 py-3">
              <span className="relative mt-0.5 grid size-9 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
                <Icon name={item.icon} size={17} />
                <span className="absolute -left-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold tabular-nums text-white">
                  {index + 1}
                </span>
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-bold leading-snug text-ink">{item.title}</div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-sub">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <Hint icon="shield" className="mt-4">{MICROCOPY.nothingPostedWithoutYou}</Hint>

        <div className="mt-auto space-y-3 pt-6">
          <Button fullWidth size="lg" iconRight="arrow-right" onClick={() => setStep(firstStep)}>
            Start my review
          </Button>
          <PublicGoogleReviewLink reviewUrl={reviewUrl} label="Skip straight to Google" />
          {trustLine}
        </div>
      </div>
    );
  }

  // ── Step 1: which service ─────────────────────────────────
  if (step === "service") {
    return (
      <div className="flex flex-1 flex-col py-6 animate-fade-in">
        <StepProgress current={0} labels={stepLabels} onBack={fresh ? () => setStep("welcome") : undefined} />
        <h1 className="text-[22px] font-extrabold leading-tight text-ink">
          What did you come to {business} for?
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-sub">{MICROCOPY.serviceStepHelp}</p>
        {serviceOptionsSource === "google_profile" ? (
          <p className="mt-1.5 text-[12px] leading-relaxed text-faint">{MICROCOPY.serviceSourceGoogle}</p>
        ) : serviceOptionsSource === "website" ? (
          <p className="mt-1.5 text-[12px] leading-relaxed text-faint">{MICROCOPY.serviceSourceWebsite}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Services">
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

        <Hint icon="alert" className="mt-4">
          Tap one to select it, tap again to clear. Nothing here is required.
        </Hint>

        <div className="mt-auto space-y-3 pt-8">
          <Button fullWidth size="lg" iconRight="arrow-right" onClick={() => setStep("rate")}>
            {selectedService ? "Continue" : "Skip this"}
          </Button>
          {trustLine}
        </div>
      </div>
    );
  }

  // ── Step 2: how was it + what stood out ───────────────────
  if (step === "rate") {
    return (
      <div className="flex flex-1 flex-col py-6 animate-fade-in">
        <StepProgress
          current={hasServiceStep ? 1 : 0}
          labels={stepLabels}
          onBack={hasServiceStep ? () => setStep("service") : fresh ? () => setStep("welcome") : undefined}
        />
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
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-bold text-ink">
                What stood out? <span className="font-medium text-faint">(up to 4)</span>
              </h2>
              <span className="data-chip tabular-nums text-faint" aria-live="polite">
                {attributes.length}/4
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-faint">
              {selectedService
                ? `Chips tuned to ${selectedService.toLowerCase()}. ${MICROCOPY.attributeStepHelp}`
                : MICROCOPY.attributeStepHelp}
            </p>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="What stood out">
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
            <Hint icon="sparkles" className="mt-3">
              Skipping this is fine. Anything you tap becomes part of the wording we suggest next.
            </Hint>
          </div>
        ) : rating === 0 ? (
          <Hint icon="star" className="mt-6 justify-center">Tap a star to rate. You can change it any time.</Hint>
        ) : null}

        {error ? <div className="mt-4"><Notice tone="danger" icon="alert">{error}</Notice></div> : null}

        <div className="mt-auto space-y-3 pt-8">
          <Button
            fullWidth
            size="lg"
            iconRight="arrow-right"
            disabled={rating < 1}
            loading={drafting}
            onClick={continueToWriting}
          >
            Continue
          </Button>
          {trustLine}
        </div>
      </div>
    );
  }

  // ── Step 3: the suggested wording, fully editable ─────────
  if (step === "write") {
    const showDrafts = drafts.length > 0 && !ownWords;
    const hasText = reviewText.trim().length > 0;
    // Loading state only while the customer is actually waiting for drafts;
    // choosing "write my own" ends the wait for them even if the request is
    // still in flight.
    const waitingForDrafts = drafting && !ownWords;
    return (
      <div className="flex flex-1 flex-col py-6">
        <StepProgress current={hasServiceStep ? 2 : 1} labels={stepLabels} onBack={() => setStep("rate")} />

        <h1 className="text-[22px] font-extrabold text-ink">
          {waitingForDrafts
            ? "Putting your answers into words"
            : showDrafts
              ? "Here's a starting point"
              : "Share your experience in your own words"}
        </h1>
        <p className="mt-1 text-[14px] leading-relaxed text-sub">
          {waitingForDrafts
            ? "A few seconds. You'll get three options to pick from and edit, or you can start writing now."
            : showDrafts
              ? MICROCOPY.draftFromYourAnswers
              : MICROCOPY.customerWordsOnly}
        </p>

        {picked.length > 0 ? (
          <div className="mt-4 rounded-card border border-hairline bg-card px-3.5 py-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-faint">
              What you told us
            </div>
            <dl className="mt-2 space-y-1.5">
              {picked.map((row) => (
                <div key={row.label} className="flex flex-wrap items-baseline gap-x-2">
                  <dt className="text-[12px] text-faint">{row.label}</dt>
                  <dd className="text-[13px] font-semibold text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {waitingForDrafts ? (
          <div className="mt-6 space-y-3" aria-live="polite">
            <p className="text-[13px] text-sub">Putting your answers into words…</p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer h-24 rounded-card" />
            ))}
            <button
              type="button"
              onClick={writeMyOwn}
              className="min-h-[44px] self-start text-[13px] font-semibold text-primary underline underline-offset-2"
            >
              {MICROCOPY.draftWriteMyOwn} Write my own
            </button>
          </div>
        ) : showDrafts ? (
          <>
            {!coachDismissed ? (
              <div className="mt-4 rounded-card border border-primary/25 bg-primary-wash/70 p-3.5 animate-fade-in" role="note">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[13px] font-bold text-ink">Three options, all yours to change</div>
                  <button
                    type="button"
                    onClick={dismissCoach}
                    aria-label="Dismiss tips"
                    className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-btn text-sub hover:bg-card hover:text-ink"
                  >
                    <Icon name="x" size={15} />
                  </button>
                </div>
                <ul className="mt-2 space-y-1.5">
                  <li className="flex items-start gap-2 text-[12px] leading-relaxed text-sub">
                    <Icon name="check-circle" size={14} className="mt-0.5 shrink-0 text-primary" /> Tap a card to choose it.
                  </li>
                  <li className="flex items-start gap-2 text-[12px] leading-relaxed text-sub">
                    <Icon name="pencil" size={14} className="mt-0.5 shrink-0 text-primary" /> Tap the pencil to change any line.
                  </li>
                  <li className="flex items-start gap-2 text-[12px] leading-relaxed text-sub">
                    <Icon name="file" size={14} className="mt-0.5 shrink-0 text-primary" /> Or write your own from a blank page below.
                  </li>
                </ul>
              </div>
            ) : null}
            <div className="mt-4 space-y-3" role="radiogroup" aria-label="Choose a starting point">
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
              onClick={writeMyOwn}
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
                onClick={() => chooseDraft(selectedDraft)}
                className="mt-3 min-h-[44px] self-start text-[13px] font-semibold text-primary underline underline-offset-2"
              >
                Show the suggested wording again
              </button>
            ) : drafting ? (
              <p className="mt-3 text-[12px] text-faint" aria-live="polite">
                Suggested wording is still on its way — it will appear as an option, and your text stays put.
              </p>
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

        {/* What happens after the tap — inline, so the button below is never a surprise. */}
        {!waitingForDrafts ? (
          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <div className="kicker">What happens next</div>
              <button
                type="button"
                onClick={() => setHowToOpen(true)}
                className="inline-flex min-h-[36px] items-center gap-1 text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
              >
                <Icon name="alert" size={13} /> How does posting work?
              </button>
            </div>
            <PostingSteps copied={hasText} compact className="mt-2" />
          </div>
        ) : null}

        <div className="mt-auto space-y-3 pt-6">
          <PublicGoogleReviewLink
            reviewUrl={reviewUrl}
            prominent
            label={hasText ? "Copy my words & open Google" : "Open Google to write my review"}
            onBeforeOpen={onPublicReviewOpen}
          />
          <Button variant="ghost" fullWidth onClick={() => setStep("feedback")}>Send private feedback instead</Button>
          {trustLine}
        </div>

        <HowToPostSheet open={howToOpen} onClose={() => setHowToOpen(false)} copied={hasText} business={business} />
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
            {MICROCOPY.privateFeedbackReassure}
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
