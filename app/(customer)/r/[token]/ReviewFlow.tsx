"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Chip } from "@/components/ds/misc";
import { Textarea } from "@/components/ds/form";
import { Button } from "@/components/ds/Button";
import { StarSelector } from "@/components/review/StarSelector";
import { DraftCard } from "@/components/review/DraftCard";
import { MegaCTA } from "@/components/review/MegaCTA";
import { PublicGoogleReviewLink } from "@/components/review/PublicGoogleReviewLink";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { advanceRequestAction, submitPrivateFeedbackAction } from "@/lib/actions";
import type { DraftVariant } from "@/lib/data/types";

type Step = "rate" | "attributes" | "drafts" | "feedback";

export function ReviewFlow({
  token, business, category, industryKey, service, reviewUrl, staffName, attributeSeeds,
}: {
  token: string; business: string; category: string; industryKey?: string; service?: string;
  reviewUrl: string; staffName?: string; attributeSeeds: string[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("rate");
  const [rating, setRating] = useState(0);
  const [selectedAttrs, setSelectedAttrs] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<DraftVariant[]>([]);
  const [chosen, setChosen] = useState(0);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function onRate(v: 1 | 2 | 3 | 4 | 5) {
    setRating(v);
    await advanceRequestAction(token, "opened", { rating: v });
    if (v >= 4) setStep("attributes");
    else setStep("feedback");
  }

  function toggleAttr(a: string) {
    setSelectedAttrs((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/review-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ business, category, industryKey, service, rating, attributes: selectedAttrs, staffName }),
      });
      const data = await res.json();
      setDrafts(data.variants ?? []);
      setStep("drafts");
    } finally {
      setLoading(false);
    }
  }

  async function copyAndOpen() {
    const text = drafts[chosen]?.text ?? "";
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be blocked */ }
    await advanceRequestAction(token, "posted_google", { rating: rating as 4 | 5, attributes: selectedAttrs });
    window.open(reviewUrl, "_blank", "noopener");
    router.push(`/r/${token}/thanks`);
  }

  async function submitFeedback() {
    setLoading(true);
    try {
      await submitPrivateFeedbackAction({ token, rating: rating as 1 | 2 | 3, text: feedback });
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  // ── Rate ──────────────────────────────────────────────────
  if (step === "rate") {
    return (
      <div className="flex flex-1 flex-col justify-center py-10">
        <h1 className="text-center text-[22px] font-extrabold text-ink">How was your visit to {business}?</h1>
        <p className="mt-2 text-center text-[14px] text-sub">Tap a star — it takes about 30 seconds.</p>
        <div className="mt-8">
          <StarSelector value={rating} onChange={onRate} />
        </div>
      </div>
    );
  }

  // ── Attributes (4–5★) ─────────────────────────────────────
  if (step === "attributes") {
    return (
      <div className="flex flex-1 flex-col py-8">
        <h1 className="text-[20px] font-extrabold text-ink">What did you love?</h1>
        <p className="mt-1 text-[14px] text-sub">Pick a couple — we&apos;ll turn them into a review.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {attributeSeeds.map((a) => (
            <Chip key={a} selected={selectedAttrs.includes(a)} onClick={() => toggleAttr(a)}>{a}</Chip>
          ))}
        </div>
        <div className="mt-auto pt-6">
          <MegaCTA label="Write my review" icon="sparkles" onClick={generate} loading={loading} disabled={selectedAttrs.length === 0} />
        </div>
      </div>
    );
  }

  // ── Drafts (4–5★) ─────────────────────────────────────────
  if (step === "drafts") {
    return (
      <div className="flex flex-1 flex-col py-8">
        <h1 className="text-[20px] font-extrabold text-ink">Here&apos;s a starting point</h1>
        <p className="mt-1 text-[13px] text-sub">{MICROCOPY.aiDraftDisclaimer}</p>
        <div className="mt-4 space-y-3">
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
          <Button variant="ghost" size="sm" icon="sparkles" onClick={generate} loading={loading}>
            Try different wording
          </Button>
        </div>
        <p className="mt-2 text-center text-[11px] text-faint">{MICROCOPY.noIncentive}</p>
        <div className="mt-auto pt-6">
          <MegaCTA label="Copy &amp; open Google" icon="google" onClick={copyAndOpen} />
        </div>
      </div>
    );
  }

  // ── Private feedback (1–3★) — public link ALWAYS visible ───
  return (
    <div className="flex flex-1 flex-col py-8">
      {submitted ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="grid size-14 place-items-center rounded-card bg-primary-tint text-primary"><Icon name="check-circle" size={28} /></div>
          <h1 className="mt-4 text-[20px] font-extrabold text-ink">Thank you — the owner will see this</h1>
          <p className="mt-1 text-[14px] text-sub">We appreciate you helping {business} improve.</p>
          <div className="mt-6 w-full">
            <PublicGoogleReviewLink reviewUrl={reviewUrl} prominent />
          </div>
        </div>
      ) : (
        <>
          <h1 className="text-[20px] font-extrabold text-ink">{MICROCOPY.privateFeedbackHeader}</h1>
          <p className="mt-1 text-[13px] text-sub">{MICROCOPY.privateFeedbackReassure}</p>
          <div className="mt-4">
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What happened? The more detail, the better we can fix it."
              rows={5}
            />
          </div>
          <Button className="mt-3" onClick={submitFeedback} loading={loading} disabled={!feedback.trim()} fullWidth>
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
