"use client";

import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Chip, Badge } from "@/components/ds/misc";
import { Textarea } from "@/components/ds/form";
import { Tabs, type TabItem } from "@/components/ds/Tabs";
import { Drawer } from "@/components/ds/Drawer";
import { useToast } from "@/components/ds/Toast";
import { Icon } from "@/components/icons";
import { ReviewCard, Stars } from "@/components/review/ReviewCard";
import { postReplyAction } from "@/lib/actions";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { formatRelative } from "@/lib/utils/format";
import type { Review, ReplyTone, DraftVariant } from "@/lib/data/types";

interface BusinessLite {
  name: string;
  rating: number;
  reviewCount: number;
}

const REPLY_TONES: ReplyTone[] = ["warm", "professional", "brief"];
const TONE_LABEL: Record<string, string> = {
  warm: "Warm",
  professional: "Professional",
  brief: "Brief",
};

function toReplyTone(tone: string): ReplyTone {
  return (REPLY_TONES as string[]).includes(tone) ? (tone as ReplyTone) : "warm";
}

const WEEK_MS = 7 * 86_400_000;

export function ReviewsInbox({
  reviews,
  business,
}: {
  reviews: Review[];
  business: BusinessLite;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();

  // Optimistic replies keyed by review id.
  const [repliedText, setRepliedText] = useState<Record<string, string>>({});

  const [tab, setTab] = useState("all");
  const [active, setActive] = useState<Review | null>(null);

  // Draft drawer state.
  const [draft, setDraft] = useState("");
  const [variants, setVariants] = useState<DraftVariant[]>([]);
  const [toneIndex, setToneIndex] = useState(0);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [aiSource, setAiSource] = useState<string>("");

  // Merge optimistic replies onto a review for display.
  const withReply = (r: Review): Review => {
    const text = repliedText[r.id];
    if (!text) return r;
    return {
      ...r,
      needsReply: false,
      reply: {
        id: `rpl_local_${r.id}`,
        text,
        tone: "warm",
        source: "human",
        postedAt: new Date().toISOString(),
        approvedBy: "You",
      },
    };
  };

  const merged = useMemo(() => reviews.map(withReply), [reviews, repliedText]);

  const isReplied = (r: Review) => Boolean(r.reply) || Boolean(repliedText[r.id]);
  const needsReplyNow = (r: Review) => r.needsReply && !repliedText[r.id];
  const isDetected = (r: Review) => Boolean(r.matchedRequestId);
  const isDurabilityRisk = (r: Review) => r.durability !== "stable";

  const counts = useMemo(() => {
    return {
      all: merged.length,
      needs: merged.filter(needsReplyNow).length,
      replied: merged.filter(isReplied).length,
      detected: merged.filter(isDetected).length,
      vanished: merged.filter(isDurabilityRisk).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merged, repliedText]);

  const newThisWeek = useMemo(
    () => merged.filter((r) => Date.now() - new Date(r.publishedAt).getTime() < WEEK_MS).length,
    [merged],
  );

  const filtered = useMemo(() => {
    switch (tab) {
      case "needs":
        return merged.filter(needsReplyNow);
      case "replied":
        return merged.filter(isReplied);
      case "detected":
        return merged.filter(isDetected);
      case "vanished":
        return merged.filter(isDurabilityRisk);
      default:
        return merged;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merged, tab, repliedText]);

  const tabs: TabItem[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "needs", label: "Needs reply", count: counts.needs },
    { key: "replied", label: "Replied", count: counts.replied },
    { key: "detected", label: "Detected", count: counts.detected },
    { key: "vanished", label: "Vanished", count: counts.vanished },
  ];

  async function openReply(review: Review) {
    setActive(review);
    setDraft("");
    setVariants([]);
    setToneIndex(0);
    setAiSource("");
    setLoadingDraft(true);
    try {
      const res = await fetch("/api/ai/reply-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewText: review.text,
          rating: review.rating,
          business: business.name,
          author: review.author,
        }),
      });
      const json = (await res.json()) as { variants?: DraftVariant[]; source?: string };
      const vs = json.variants ?? [];
      setVariants(vs);
      setDraft(vs[0]?.text ?? "");
      setAiSource(json.source ?? "");
    } catch {
      toast("Couldn't load a draft — write your own reply", "warning", "alert");
    } finally {
      setLoadingDraft(false);
    }
  }

  function pickTone(i: number) {
    setToneIndex(i);
    const v = variants[i];
    if (v) setDraft(v.text);
  }

  function post() {
    const review = active;
    if (!review || !draft.trim()) return;
    const tone = toReplyTone(variants[toneIndex]?.tone ?? "warm");
    start(async () => {
      await postReplyAction({ reviewId: review.id, text: draft.trim(), tone });
      setRepliedText((prev) => ({ ...prev, [review.id]: draft.trim() }));
      toast("Reply published", "success", "check-circle");
      setActive(null);
    });
  }

  const durabilityAtRisk = merged.filter(isDurabilityRisk);

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[24px] font-extrabold tabular-nums text-ink">{business.rating.toFixed(1)}</span>
              <Icon name="star-fill" size={18} className="text-star" />
            </div>
            <div className="kicker mt-0.5">Rating</div>
          </div>
          <Stat label="Total reviews" value={business.reviewCount} />
          <Stat label="New this week" value={newThisWeek} />
          <Stat label="Needs reply" value={counts.needs} tone={counts.needs > 0 ? "gold" : "neutral"} />
          <Stat label="Detected from requests" value={counts.detected} tone="primary" />
        </div>
      </Card>

      {/* Durability banner */}
      {durabilityAtRisk.length > 0 ? (
        <div className="flex items-start gap-3 rounded-card border border-danger/30 bg-danger-tint/60 p-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-btn bg-danger text-white">
            <Icon name="alert" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-ink">
              {durabilityAtRisk.length} {durabilityAtRisk.length === 1 ? "review needs" : "reviews need"} a durability check
            </div>
            <p className="text-[14px] text-sub">
              Google sometimes filters or removes reviews. We flag anything vanished or at risk so nothing quietly disappears.
            </p>
          </div>
        </div>
      ) : null}

      <Tabs items={tabs} active={tab} onChange={setTab} />

      {/* Review list */}
      {filtered.length ? (
        <div className="space-y-3">
          {filtered.map((r) => (
            <ReviewCard key={r.id} review={r} onReply={() => openReply(r)} />
          ))}
        </div>
      ) : (
        <Card>
          <p className="py-8 text-center text-[14px] text-faint">Nothing here right now.</p>
        </Card>
      )}

      {/* Reply drawer */}
      <Drawer open={active !== null} onClose={() => setActive(null)} title="Reply to review" wide>
        {active ? (
          <div className="space-y-4">
            {/* Original review */}
            <div className="rounded-card border border-hairline bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[15px] font-semibold text-ink">{active.author}</div>
                <Stars rating={active.rating} />
              </div>
              <div className="mt-0.5 text-[12px] text-faint">{formatRelative(active.publishedAt)}</div>
              <p className="mt-2 text-[15px] leading-relaxed text-ink/90">{active.text}</p>
            </div>

            {isDurabilityRisk(active) ? (
              <div className="flex items-start gap-2 rounded-btn border border-danger/30 bg-danger-tint/50 px-3 py-2">
                <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-danger" />
                <p className="text-[13px] text-sub">
                  This review is {active.durability === "vanished" ? "no longer showing on Google" : "at risk of being filtered"}.
                  Replying can help, but Google controls final visibility.
                </p>
              </div>
            ) : null}

            {/* Tone options */}
            <div>
              <div className="mb-2 text-[13px] font-bold text-sub">Choose a tone</div>
              {loadingDraft ? (
                <div className="text-[14px] text-faint">Drafting a reply…</div>
              ) : variants.length ? (
                <div className="flex flex-wrap gap-2">
                  {variants.map((v, i) => (
                    <Chip key={i} selected={i === toneIndex} onClick={() => pickTone(i)}>
                      {TONE_LABEL[v.tone] ?? v.tone}
                    </Chip>
                  ))}
                </div>
              ) : (
                <div className="text-[14px] text-faint">Write your reply below.</div>
              )}
            </div>

            {/* Editable draft */}
            <div>
              <div className="mb-2 text-[13px] font-bold text-sub">Your reply</div>
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a warm, specific reply…"
                className="min-h-[140px]"
              />
              <p className="mt-1.5 text-[13px] text-faint">{MICROCOPY.aiDraftDisclaimer}</p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          <Button onClick={post} loading={pending} disabled={!draft.trim() || loadingDraft} icon="send" fullWidth>
            Post reply to Google
          </Button>
        </div>
        {aiSource === "template" ? (
          <p className="mt-2 text-center text-[12px] text-faint">Starter template — make it yours before posting.</p>
        ) : null}
      </Drawer>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "primary" | "gold";
}) {
  const color =
    tone === "primary" ? "text-primary-dark" : tone === "gold" ? "text-gold-deep" : "text-ink";
  return (
    <div>
      <div className={`text-[24px] font-extrabold tabular-nums ${color}`}>{value}</div>
      <div className="kicker mt-0.5">{label}</div>
    </div>
  );
}
