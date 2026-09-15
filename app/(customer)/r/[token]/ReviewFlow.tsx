"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";
import { Chip } from "@/components/ds/misc";
import { Textarea, Toggle } from "@/components/ds/form";
import { Button } from "@/components/ds/Button";
import { StarSelector } from "@/components/review/StarSelector";
import { PublicGoogleReviewLink } from "@/components/review/PublicGoogleReviewLink";
import { PostingSteps } from "@/components/review/PostingSteps";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { chipGroupsForServices } from "@/lib/industries/service-attributes";
import { advanceRequestAction, submitPrivateFeedbackAction } from "@/lib/actions";
import type { RequestStatus } from "@/lib/data/types";
import type { ServiceOptionSource } from "@/lib/industries";

type Step = "tell" | "write" | "feedback";
type Rating = 1 | 2 | 3 | 4 | 5;

interface Draft {
  text: string;
  tone: string;
}

/** Where the thank-you page reads the customer's wording back from. */
export function reviewHandoffKey(token: string): string {
  return `foundly.review.${token}`;
}

/** The most "what stood out" chips one review can carry. */
const MAX_ATTRIBUTES = 6;
/** Services shown; a Google profile can list dozens. */
const MAX_SERVICES = 12;

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

/** A numbered question heading: "1  What did you come in for?" */
function Question({
  number,
  children,
  aside,
}: {
  number: number;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5 text-[16px] font-extrabold leading-tight text-ink">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-bold tabular-nums text-white">
          {number}
        </span>
        <span>{children}</span>
      </h2>
      {aside ? <div className="shrink-0 text-[12px] font-medium text-faint">{aside}</div> : null}
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
 * Two screens. On the first the customer answers three questions in one
 * scroll — what they came in for (as many services as apply), how it went,
 * and what stood out (chips grouped under each service they picked). On the
 * second they see ONE editable review box with their wording in it, a Copy
 * button, and the Google button. Those answers are the ONLY source of the
 * suggested wording, and:
 * - every rating follows the same public-review path (no gating);
 * - AI never adds a service, person, claim or keyword the customer didn't pick;
 * - writing from scratch is one tap away;
 * - private feedback is optional and never hides the Google link.
 *
 * It used to be a five-screen wizard (welcome, service, rating, three draft
 * cards with pencil toggles, a how-to sheet). Customers scanning a QR code at
 * a counter did not get through it. Everything they need is now in front of
 * them at once, and the explanation lives in the hero card instead of a gate.
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

  const services = useMemo(() => serviceOptions.slice(0, MAX_SERVICES), [serviceOptions]);
  const hasServices = services.length > 0;

  const [step, setStep] = useState<Step>("tell");
  const [selectedServices, setSelectedServices] = useState<string[]>(() => {
    const hint = service?.toLowerCase();
    const match = hint ? services.find((item) => item.toLowerCase() === hint) : undefined;
    return match ? [match] : [];
  });
  const [rating, setRating] = useState<number>(initialRating ?? 0);
  const [attributes, setAttributes] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  /** Whether a model wrote the wording or the deterministic template did. */
  const [draftSource, setDraftSource] = useState<"ai" | "template">("template");
  const [selectedDraft, setSelectedDraft] = useState(0);
  const [drafting, setDrafting] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [ownWords, setOwnWords] = useState(false);
  /** The customer's from-scratch text, kept while they look at a suggestion. */
  const [ownText, setOwnText] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [canContact, setCanContact] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  /**
   * Set when the customer chooses their own words while drafts are still
   * loading, so the drafts arriving later never overwrite that choice.
   */
  const ownWordsRef = useRef(false);

  /**
   * "What stood out" rows: one per picked service with chips about that kind
   * of work, then the industry's general chips. Recomputed whenever the
   * services change; picked chips that disappear are dropped so nothing
   * invisible can reach the draft.
   */
  const chipGroups = useMemo(
    () => chipGroupsForServices(selectedServices, positiveSeeds, neutralSeeds),
    [selectedServices, positiveSeeds, neutralSeeds],
  );
  const visibleChips = useMemo(() => new Set(chipGroups.flatMap((group) => group.chips)), [chipGroups]);

  useEffect(() => {
    setAttributes((current) => current.filter((chip) => visibleChips.has(chip)));
  }, [visibleChips]);

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

  function toggleService(item: string) {
    setSelectedServices((current) =>
      current.includes(item) ? current.filter((value) => value !== item) : [...current, item],
    );
  }

  function toggleAttribute(chip: string) {
    setAttributes((current) =>
      current.includes(chip)
        ? current.filter((item) => item !== chip)
        : current.length >= MAX_ATTRIBUTES
          ? current
          : [...current, chip],
    );
  }

  /**
   * Ask the server for starting-point wording built from the answers the
   * customer just gave. A failure is never fatal — the customer lands on the
   * same editor with an empty box and writes it themselves.
   */
  async function buildDrafts(value: Rating, chosenAttributes: string[], chosenServices: string[]) {
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
          ...(chosenServices.length > 0 ? { services: chosenServices, service: chosenServices[0] } : {}),
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
      setError("Tap a star first.");
      return;
    }
    setError(null);
    setCopied(false);
    setStep("write");
    window.scrollTo({ top: 0 });
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOwnWords(true);
      return;
    }
    await buildDrafts(rating as Rating, attributes, selectedServices);
  }

  function chooseDraft(index: number) {
    if (ownWords) setOwnText(reviewText);
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
    setReviewText(ownText);
    setEditMessage(null);
  }

  /** Every keystroke lands in the box AND in the suggestion it came from, so switching tabs never loses an edit. */
  function editText(value: string) {
    const next = value.slice(0, 2_000);
    setReviewText(next);
    setEditMessage(null);
    setCopied(false);
    if (ownWords) {
      setOwnText(next);
    } else {
      setDrafts((current) => current.map((item, i) => (i === selectedDraft ? { ...item, text: next } : item)));
    }
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
      editText(data.suggestion);
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

  async function copyText() {
    const text = reviewText.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("Copying isn't available here — select the text and copy it by hand.");
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
      setError("Tap a star first.");
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

  if (terminal === "posted" && step === "tell") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-16 text-center animate-fade-in">
        <div className="grid size-16 place-items-center rounded-card bg-gold-tint text-gold-deep">
          <Icon name="star-fill" size={32} />
        </div>
        <h1 className="mt-5 text-[22px] font-extrabold text-ink">You&apos;ve already shared a review</h1>
        <p className="mt-2 max-w-xs text-[14px] text-sub">Thanks for supporting {business}.</p>
        <div className="mt-6 w-full">
          <PublicGoogleReviewLink reviewUrl={reviewUrl} />
        </div>
      </div>
    );
  }

  if (terminal === "private" && step === "tell" && !submitted) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-14 text-center animate-fade-in">
        <div className="grid size-16 place-items-center rounded-card bg-primary-tint text-primary">
          <Icon name="check-circle" size={32} />
        </div>
        <h1 className="mt-5 text-[22px] font-extrabold text-ink">Your private feedback is already in</h1>
        <p className="mt-2 max-w-xs text-[14px] text-sub">The owner has your note. The public option remains available.</p>
        <div className="mt-6 w-full">
          <PublicGoogleReviewLink reviewUrl={reviewUrl} />
        </div>
      </div>
    );
  }

  // ── Screen 1: three questions, one scroll ───────────────────
  if (step === "tell") {
    const ratingNumber = hasServices ? 2 : 1;
    const chipsNumber = ratingNumber + 1;
    const showChips = rating > 0 && chipGroups.length > 0;
    return (
      <div className="flex flex-1 flex-col py-5 animate-fade-in">
        <div className="rounded-card bg-hero p-4 text-white shadow-lg on-hero">
          <div className="flex items-center gap-2 text-gold">
            <Icon name="clock" size={14} />
            <span className="data-chip text-gold">About a minute</span>
          </div>
          <h1 className="mt-2 text-[22px] font-extrabold leading-tight tracking-tight">
            Thanks for choosing {business}
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/80">
            Answer {hasServices ? "three" : "two"} quick questions. We turn them into a review you copy and post on Google yourself.
          </p>
          {staffName ? (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-chip bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-white">
              <Icon name="users" size={13} className="text-gold" /> {staffName} helped you today
            </div>
          ) : null}
        </div>

        {offline ? (
          <div className="mt-4">
            <Notice tone="warning" icon="clock">You&apos;re offline. You can still rate; sharing needs a connection.</Notice>
          </div>
        ) : null}

        {hasServices ? (
          <section className="mt-6" aria-labelledby="q-services">
            <Question number={1} aside="Pick all that apply">
              <span id="q-services">What did you come in for?</span>
            </Question>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Services">
              {services.map((item) => (
                <Chip key={item} selected={selectedServices.includes(item)} onClick={() => toggleService(item)}>
                  {item}
                </Chip>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-faint">
              {serviceOptionsSource === "google_profile"
                ? MICROCOPY.serviceSourceGoogle
                : serviceOptionsSource === "website"
                  ? MICROCOPY.serviceSourceWebsite
                  : MICROCOPY.serviceStepHelp}
            </p>
          </section>
        ) : null}

        <section className="mt-6" aria-labelledby="q-rating">
          <Question number={ratingNumber}>
            <span id="q-rating">How did it go?</span>
          </Question>
          <div className="mt-3 rounded-card border border-hairline bg-card py-4">
            <StarSelector value={rating} onChange={onRate} showLabel size={42} />
          </div>
          {rating === 0 ? (
            <Hint icon="star" className="mt-2 justify-center">Any rating is welcome — good, bad or in between.</Hint>
          ) : null}
        </section>

        {showChips ? (
          <section className="mt-6 animate-slide-up" aria-labelledby="q-chips">
            <Question
              number={chipsNumber}
              aside={attributes.length > 0 ? <span className="tabular-nums" aria-live="polite">{attributes.length} picked</span> : "Optional"}
            >
              <span id="q-chips">What stood out?</span>
            </Question>
            <div className="mt-1 pl-[34px] text-[12px] leading-relaxed text-faint">{MICROCOPY.attributeStepHelp}</div>
            <div className="mt-3 space-y-3.5" role="group" aria-label="What stood out">
              {chipGroups.map((group) => (
                <div key={group.service ?? "general"}>
                  {group.service ? (
                    <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-primary-dark">
                      <Icon name="check-circle" size={13} />
                      About {group.service}
                    </div>
                  ) : chipGroups.length > 1 ? (
                    <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-sub">
                      <Icon name="sparkles" size={13} />
                      Overall
                    </div>
                  ) : null}
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label={group.service ? `What stood out about ${group.service}` : "What stood out overall"}
                  >
                    {group.chips.map((chip) => (
                      <Chip
                        key={chip}
                        selected={attributes.includes(chip)}
                        disabled={!attributes.includes(chip) && attributes.length >= MAX_ATTRIBUTES}
                        onClick={() => toggleAttribute(chip)}
                      >
                        {chip}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {error ? <div className="mt-4"><Notice tone="danger" icon="alert">{error}</Notice></div> : null}

        <div className="sticky bottom-0 z-10 mt-auto bg-gradient-to-t from-paper via-paper to-transparent pb-2 pt-6">
          <Button
            fullWidth
            size="lg"
            iconRight="arrow-right"
            disabled={rating < 1}
            loading={drafting}
            onClick={continueToWriting}
          >
            {rating < 1 ? "Tap a star to continue" : "See my review"}
          </Button>
        </div>
        <div className="space-y-3 pt-3">
          <Hint icon="shield">{MICROCOPY.nothingPostedWithoutYou}</Hint>
          <PublicGoogleReviewLink reviewUrl={reviewUrl} label="Skip straight to Google" />
          {trustLine}
        </div>
      </div>
    );
  }

  // ── Screen 2: one box, one Copy button, one Google button ───
  if (step === "write") {
    const hasText = reviewText.trim().length > 0;
    // Loading state only while the customer is actually waiting for drafts;
    // choosing "write my own" ends the wait for them even if the request is
    // still in flight.
    const waitingForDrafts = drafting && !ownWords;
    const hasDrafts = drafts.length > 0;
    return (
      <div className="flex flex-1 flex-col py-5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep("tell")}
            className="-mx-1 inline-flex min-h-[44px] items-center gap-1 px-1 text-[13px] font-semibold text-sub transition-all hover:text-ink active:scale-[0.98]"
          >
            <Icon name="chevron-left" size={16} /> Change my answers
          </button>
          <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Icon key={n} name="star-fill" size={14} className={n <= rating ? "text-star" : "text-hairline"} />
            ))}
          </span>
        </div>

        <h1 className="mt-3 text-[22px] font-extrabold leading-tight tracking-tight text-ink">
          {waitingForDrafts ? "Writing it up for you" : hasDrafts && !ownWords ? "Your review is ready" : "Your review, in your own words"}
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-sub">
          {waitingForDrafts
            ? "A few seconds. Built only from what you just told us — or start typing now."
            : hasDrafts && !ownWords
              ? "Read it, change anything you like, then copy it to Google. Only what you told us went into it."
              : MICROCOPY.customerWordsOnly}
        </p>

        {(selectedServices.length > 0 || attributes.length > 0) ? (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="What you told us">
            {selectedServices.map((item) => (
              <span key={`s-${item}`} className="rounded-chip bg-primary-tint px-2.5 py-1 text-[12px] font-semibold text-primary-dark">
                {item}
              </span>
            ))}
            {attributes.map((item) => (
              <span key={`a-${item}`} className="rounded-chip border border-hairline bg-card px-2.5 py-1 text-[12px] font-medium text-sub">
                {item}
              </span>
            ))}
          </div>
        ) : null}

        {hasDrafts ? (
          <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Choose a starting point">
            {drafts.map((draft, index) => {
              const active = !ownWords && selectedDraft === index;
              return (
                <button
                  key={draft.tone}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => chooseDraft(index)}
                  className={cn(
                    "shrink-0 rounded-chip border px-3 py-1.5 text-[12px] font-semibold transition-colors min-h-[36px]",
                    active ? "border-primary bg-primary text-white" : "border-hairline bg-card text-sub hover:border-primary/40 hover:text-ink",
                  )}
                >
                  {draft.tone}
                </button>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={ownWords}
              onClick={writeMyOwn}
              className={cn(
                "shrink-0 rounded-chip border px-3 py-1.5 text-[12px] font-semibold transition-colors min-h-[36px]",
                ownWords ? "border-primary bg-primary text-white" : "border-hairline bg-card text-sub hover:border-primary/40 hover:text-ink",
              )}
            >
              Write my own
            </button>
          </div>
        ) : null}

        {waitingForDrafts ? (
          <div className="mt-4" aria-live="polite">
            <div className="shimmer h-40 rounded-card" />
            <button
              type="button"
              onClick={writeMyOwn}
              className="mt-3 min-h-[44px] text-[13px] font-semibold text-primary underline underline-offset-2"
            >
              Write my own instead
            </button>
          </div>
        ) : (
          <div
            className={cn(
              "mt-3 overflow-hidden rounded-card border-2 bg-card shadow-sm transition-colors focus-within:border-primary",
              copied ? "border-primary" : "border-primary/30",
            )}
          >
            <textarea
              value={reviewText}
              onChange={(event) => editText(event.target.value)}
              placeholder="What happened, and what would be useful for the next person to know?"
              rows={7}
              aria-label="Your Google review in your own words"
              className="block w-full resize-y bg-transparent px-4 py-3.5 text-[15px] leading-relaxed text-ink placeholder:text-faint focus-visible:outline-none"
            />
            <div className="flex items-center justify-between gap-2 border-t border-hairline bg-paper/60 px-3 py-2">
              <span className="text-[11px] tabular-nums text-faint">{reviewText.length}/2000</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  icon="sparkles"
                  onClick={improveClarity}
                  loading={loading}
                  disabled={reviewText.trim().length < 10}
                >
                  Improve clarity only
                </Button>
                <Button
                  variant={copied ? "primary" : "secondary"}
                  size="sm"
                  icon={copied ? "check" : "copy"}
                  onClick={copyText}
                  disabled={!hasText}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          </div>
        )}

        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          {hasDrafts && !ownWords
            ? draftSource === "ai"
              ? MICROCOPY.aiDraftDisclaimer
              : MICROCOPY.draftTemplateDisclaimer
            : MICROCOPY.aiReviewEditDisclaimer}
        </p>

        {editMessage ? (
          <p role="status" className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-primary-dark">
            <Icon name="check-circle" size={15} className="mt-px shrink-0" /> {editMessage}
          </p>
        ) : null}
        {error ? <div className="mt-4"><Notice tone="danger" icon="alert">{error}</Notice></div> : null}
        {copied ? (
          <p role="status" className="mt-3 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-primary">
            <Icon name="check-circle" size={16} /> Copied. Paste it into the Google review box.
          </p>
        ) : null}

        <div className="mt-auto space-y-3 pt-6">
          {!waitingForDrafts ? <PostingSteps copied={hasText} compact className="justify-center" /> : null}
          <PublicGoogleReviewLink
            reviewUrl={reviewUrl}
            prominent
            label={hasText ? (copied ? "Open Google & paste" : "Copy & open Google") : "Open Google to write my review"}
            onBeforeOpen={onPublicReviewOpen}
          />
          <Button variant="ghost" fullWidth onClick={() => setStep("feedback")}>Send private feedback instead</Button>
          {trustLine}
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
            <PublicGoogleReviewLink reviewUrl={reviewUrl} />
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
