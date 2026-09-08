"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ds/Button";
import { PostingSteps } from "./PostingSteps";

/**
 * Bottom sheet that explains the posting hand-off in full.
 *
 * Informational only. It is opened from a secondary "How does posting work?"
 * control and closes back to the same screen — the public Google link stays
 * where it was, unconditionally, so this never becomes a gate in front of it.
 */
export function HowToPostSheet({
  open,
  onClose,
  copied,
  business,
}: {
  open: boolean;
  onClose: () => void;
  copied: boolean;
  business: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/35 animate-fade-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-post-title"
        className="relative w-full max-w-[440px] rounded-t-card bg-paper p-5 pb-7 shadow-lg animate-slide-up sm:rounded-card sm:pb-5"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-hairline sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="kicker">Posting your review</div>
            <h2 id="how-to-post-title" className="mt-1 text-[19px] font-extrabold leading-tight text-ink">
              Here&apos;s what happens next
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-sub">
              Google reviews can only be posted on Google, by you. Foundly gets you there with your
              words ready.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 shrink-0 place-items-center rounded-btn text-sub transition-colors hover:bg-card hover:text-ink"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <PostingSteps copied={copied} className="mt-4" />

        <div className="mt-4 flex items-start gap-2 rounded-btn bg-primary-wash px-3 py-2.5 text-[12px] leading-relaxed text-sub">
          <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-primary" />
          <span>
            Nothing is posted for you and nothing is stored on Google by Foundly. {business} only sees
            what you choose to publish.
          </span>
        </div>

        <Button className="mt-4" fullWidth size="lg" onClick={onClose}>
          Got it
        </Button>
      </div>
    </div>
  );
}
