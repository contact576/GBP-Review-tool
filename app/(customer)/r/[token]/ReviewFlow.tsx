"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { ProgressRail } from "@/components/ds/misc";
import { Textarea, Toggle } from "@/components/ds/form";
import { Button } from "@/components/ds/Button";
import { StarSelector } from "@/components/review/StarSelector";
import { PublicGoogleReviewLink } from "@/components/review/PublicGoogleReviewLink";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { advanceRequestAction, submitPrivateFeedbackAction } from "@/lib/actions";
import type { RequestStatus } from "@/lib/data/types";

type Step = "rate" | "write" | "feedback";
type Rating = 1 | 2 | 3 | 4 | 5;

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

interface ReviewFlowProps {
  token: string;
  business: string;
  category: string;
  industryKey?: string;
  service?: string;
  reviewUrl: string;
  staffName?: string;
  attributeSeeds: string[];
  initialStatus?: RequestStatus;
  initialRating?: Rating;
}

/**
 * Policy-critical customer experience:
 * - every rating follows the same public-review path;
 * - the customer supplies all review content;
 * - AI can only perform a guarded clarity edit of those existing words;
 * - private feedback is optional and never hides the Google link.
 */
export function ReviewFlow({
  token,
  business,
  reviewUrl,
  initialStatus,
  initialRating,
}: ReviewFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("rate");
  const [rating, setRating] = useState<number>(initialRating ?? 0);
  const [reviewText, setReviewText] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [canContact, setCanContact] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

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

  async function onRate(value: Rating) {
    setRating(value);
    try {
      await advanceRequestAction(token, "opened", { rating: value });
    } catch {
      // Progress analytics never blocks the customer.
    }
    setStep("write");
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
      void advanceRequestAction(token, "clicked", { rating: rating as Rating }).catch(() => undefined);
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

  if (terminal === "posted" && step === "rate") {
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

  if (terminal === "private" && step === "rate" && !submitted) {
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

  if (step === "rate") {
    return (
      <div className="flex flex-1 flex-col justify-center py-10 animate-fade-in">
        {offline ? <Notice tone="warning" icon="clock">You&apos;re offline. You can still rate; sharing needs a connection.</Notice> : null}
        <h1 className="text-center text-[24px] font-extrabold leading-tight text-ink">
          How was your experience with {business}?
        </h1>
        <p className="mt-2 text-center text-[14px] text-sub">
          Your honest feedback is welcome at every rating.
        </p>
        <div className="mt-10">
          <StarSelector value={rating} onChange={onRate} showLabel size={52} />
        </div>
        <p className="mt-8 text-center text-[12px] leading-relaxed text-faint">
          {MICROCOPY.samePathEveryRating} {MICROCOPY.noIncentive}
        </p>
      </div>
    );
  }

  if (step === "write") {
    return (
      <div className="flex flex-1 flex-col py-6">
        <div className="mb-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep("rate")}
            className="-mx-1 inline-flex min-h-[44px] items-center gap-1 px-1 text-[13px] font-semibold text-sub transition-all hover:text-ink active:scale-[0.98]"
          >
            <Icon name="chevron-left" size={16} /> Back
          </button>
          <ProgressRail current={1} total={2} />
        </div>

        <h1 className="text-[22px] font-extrabold text-ink">Share your experience in your own words</h1>
        <p className="mt-1 text-[14px] leading-relaxed text-sub">{MICROCOPY.customerWordsOnly}</p>
        <p className="mt-2 text-[12px] leading-relaxed text-faint">{MICROCOPY.samePathEveryRating}</p>

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
          <p className="text-center text-[11px] leading-relaxed text-faint">{MICROCOPY.noIncentive}</p>
        </div>
      </div>
    );
  }

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
