"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ds/Button";
import { PostingSteps } from "@/components/review/PostingSteps";
import { reviewHandoffKey } from "../ReviewFlow";

interface Handoff {
  text: string;
  rating: number | null;
}

/**
 * The customer is now looking at two tabs: Google (where they post) and this
 * one. This panel is the safety net for the hand-off — it shows the exact
 * wording they chose, lets them copy it again if the clipboard was lost on the
 * way, and repeats the three posting steps so nobody is stranded.
 *
 * The wording comes from sessionStorage, written by the flow just before it
 * opened Google. It never touches the server: nothing here is stored or sent.
 */
export function ThanksPanel({ token, business, reviewUrl }: { token: string; business: string; reviewUrl: string }) {
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(reviewHandoffKey(token));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Handoff>;
      if (typeof parsed.text === "string" && parsed.text.trim()) {
        setHandoff({ text: parsed.text, rating: typeof parsed.rating === "number" ? parsed.rating : null });
      }
    } catch {
      // No hand-off — the page still shows the steps and the Google link.
    }
  }, [token]);

  async function copyAgain() {
    if (!handoff) return;
    try {
      await navigator.clipboard.writeText(handoff.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }

  const hasText = Boolean(handoff?.text);

  return (
    <div className="flex flex-1 flex-col py-8 animate-fade-in">
      <div className="text-center">
        <div className="relative mx-auto w-fit animate-slide-up">
          <span className="pointer-events-none absolute -right-1 -top-1 text-gold" aria-hidden>
            <Icon name="sparkles" size={20} />
          </span>
          <div className="grid size-20 place-items-center rounded-card bg-gold-tint text-gold-deep shadow-lg">
            <Icon name="star-fill" size={38} />
          </div>
        </div>
        <h1 className="mt-6 text-[24px] font-extrabold leading-tight text-ink animate-slide-up">
          {hasText ? "Your words are copied — finish on Google" : "Finish your review on Google"}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-sub">
          Google opened in a new tab. If you already posted, thank you for supporting {business}.
        </p>
      </div>

      {handoff ? (
        <div className="mt-6 rounded-card border border-hairline bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="kicker">Your review</div>
            {handoff.rating ? (
              <span className="inline-flex items-center gap-0.5" aria-label={`${handoff.rating} out of 5 stars`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Icon key={n} name="star-fill" size={13} className={n <= (handoff.rating ?? 0) ? "text-star" : "text-hairline"} />
                ))}
              </span>
            ) : null}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{handoff.text}</p>
          <Button
            className="mt-3"
            variant="secondary"
            size="sm"
            icon={copied ? "check" : "copy"}
            fullWidth
            onClick={copyAgain}
          >
            {copied ? "Copied again" : "Copy again"}
          </Button>
        </div>
      ) : null}

      <div className="mt-6">
        <div className="kicker">In the Google tab</div>
        <PostingSteps copied={hasText} className="mt-2" />
      </div>

      <div className="mt-auto space-y-3 pt-8">
        <a
          href={reviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-compliance="public-google-link"
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-btn bg-primary px-5 py-3 text-[15px] font-bold text-white shadow-sm transition-all hover:bg-primary-dark active:scale-[0.98]"
        >
          <Icon name="google" size={18} /> {hasText ? "Open Google again" : "Open Google"}
          <Icon name="external" size={16} className="text-white/70" />
        </a>
        <p className="text-center text-[12px] leading-relaxed text-faint">
          Lost the tab? This button opens the same review page.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-[44px] w-full items-center justify-center text-[13px] text-faint underline underline-offset-2 transition-all active:scale-[0.98]"
        >
          Done
        </Link>
      </div>
    </div>
  );
}
