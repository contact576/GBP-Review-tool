"use client";

import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Chip, Badge, EmptyState } from "@/components/ds/misc";
import { Textarea } from "@/components/ds/form";
import { Tabs, type TabItem } from "@/components/ds/Tabs";
import { Table, type Column, type SortDirection } from "@/components/ds/Table";
import { Drawer } from "@/components/ds/Drawer";
import { useToast } from "@/components/ds/Toast";
import { Icon } from "@/components/icons";
import { StatTile } from "@/components/charts";
import { ReviewCard, Stars } from "@/components/review/ReviewCard";
import { PublicGoogleReviewLink } from "@/components/review/PublicGoogleReviewLink";
import { postReplyAction } from "@/lib/actions";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { formatRelative, initials } from "@/lib/utils/format";
import type { Review, ReplyTone, DraftVariant } from "@/lib/data/types";

interface BusinessLite {
  name: string;
  rating: number;
  reviewCount: number;
  /** Google "write a review" deep link — the public link kept at parity on the 1–3★ cut. */
  reviewUrl: string;
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
const THIRTY_DAYS_MS = 30 * 86_400_000;

/**
 * Dense-row rating chrome renders in INK, never the gold star hue — the star
 * hue is reserved for the literal filled-star input in the mobile review flow.
 */
function InkStars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name={n <= rating ? "star-fill" : "star"}
          size={13}
          className={n <= rating ? "text-ink" : "text-hairline"}
        />
      ))}
    </span>
  );
}

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
  const [sort, setSort] = useState<{ key: string; direction: SortDirection }>({
    key: "date",
    direction: "desc",
  });
  const [active, setActive] = useState<Review | null>(null);
  const [watchdogDismissed, setWatchdogDismissed] = useState(false);

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
      low: merged.filter((r) => r.rating <= 3).length,
      high: merged.filter((r) => r.rating >= 4).length,
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
      case "low":
        return merged.filter((r) => r.rating <= 3);
      case "high":
        return merged.filter((r) => r.rating >= 4);
      case "vanished":
        return merged.filter(isDurabilityRisk);
      default:
        return merged;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merged, tab, repliedText]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sort.direction === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sort.key === "rating") return (a.rating - b.rating) * dir;
      return (new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()) * dir;
    });
    return arr;
  }, [filtered, sort]);

  const tabs: TabItem[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "needs", label: "Needs reply", count: counts.needs },
    { key: "replied", label: "Replied", count: counts.replied },
    { key: "detected", label: "Detected", count: counts.detected },
    { key: "low", label: "1–3★", count: counts.low },
    { key: "high", label: "4–5★", count: counts.high },
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

  // ── Durability watchdog: surface only what's already on the reviews ──
  const vanished = merged.filter((r) => r.durability === "vanished");
  const atRisk = merged.filter((r) => r.durability === "at_risk");
  const vanishedLast30 = vanished.filter(
    (r) => r.vanishedAt && Date.now() - new Date(r.vanishedAt).getTime() < THIRTY_DAYS_MS,
  );
  const hasVanished = vanished.length > 0;
  const showWatchdog = (vanished.length > 0 || atRisk.length > 0) && !watchdogDismissed;

  // Prefer the honest "last 30 days" framing when we have a vanishedAt to back it.
  const vanishedShown = vanishedLast30.length > 0 ? vanishedLast30.length : vanished.length;
  const watchdogHeadline = hasVanished
    ? `${vanishedShown} ${vanishedShown === 1 ? "review" : "reviews"} vanished from Google${
        vanishedLast30.length > 0 ? " in the last 30 days" : ""
      }`
    : `${atRisk.length} ${atRisk.length === 1 ? "review is" : "reviews are"} at risk of being filtered`;

  // ── Ledger columns (desktop) ──
  const columns: Column<Review>[] = [
    {
      key: "author",
      header: "Reviewer",
      width: "200px",
      render: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-chip bg-primary-tint text-[12px] font-bold text-primary-dark">
            {initials(r.author)}
          </div>
          <span className="truncate font-semibold text-ink">{r.author}</span>
        </div>
      ),
    },
    {
      key: "rating",
      header: "Rating",
      width: "116px",
      sortable: true,
      ariaLabel: "Sort by rating",
      render: (r) => <InkStars rating={r.rating} />,
    },
    {
      key: "text",
      header: "Review",
      cellClassName: "max-w-[420px]",
      render: (r) => <span className="line-clamp-2 text-[13px] leading-snug text-ink/90">{r.text}</span>,
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      width: "230px",
      render: (r) => (
        <ReviewStatusPills
          review={r}
          replied={isReplied(r)}
          needsReply={needsReplyNow(r)}
          detected={isDetected(r)}
        />
      ),
    },
    {
      key: "date",
      header: "Posted",
      align: "right",
      width: "116px",
      sortable: true,
      ariaLabel: "Sort by date posted",
      cellClassName: "text-sub tabular-nums whitespace-nowrap",
      render: (r) => formatRelative(r.publishedAt),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Summary strip — boxless StatTile spec-cells */}
      <Card padded={false}>
        <div className="grid grid-cols-2 divide-x divide-y divide-hairline sm:grid-cols-5 sm:divide-y-0">
          <StatTile boxless className="p-4 sm:p-5" label="AVG RATING" value={business.rating.toFixed(1)} deltaCaption="of 5" />
          <StatTile boxless className="p-4 sm:p-5" label="TOTAL REVIEWS" value={business.reviewCount} />
          <StatTile boxless className="p-4 sm:p-5" label="NEW THIS WEEK" value={newThisWeek} />
          <StatTile boxless className="p-4 sm:p-5" label="NEEDS REPLY" value={counts.needs} />
          <StatTile boxless className="p-4 sm:p-5" label="DETECTED" value={counts.detected} />
        </div>
      </Card>

      {/* Durability watchdog banner — gold when only at-risk, danger once any vanished */}
      {showWatchdog ? (
        <div
          className={`flex items-start gap-3 rounded-card border p-4 ${
            hasVanished ? "border-danger/30 bg-danger-tint/60" : "border-gold/40 bg-gold-tint/50"
          }`}
        >
          <div
            className={`grid size-9 shrink-0 place-items-center rounded-btn text-white ${
              hasVanished ? "bg-danger" : "bg-gold text-ink"
            }`}
          >
            <Icon name={hasVanished ? "alert" : "flag"} size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-ink">{watchdogHeadline}</div>
            <p className="mt-0.5 text-[14px] text-sub">
              Google sometimes filters or removes reviews. We track which of yours stick, so nothing
              quietly disappears.
              {hasVanished && atRisk.length > 0
                ? ` ${atRisk.length} more ${atRisk.length === 1 ? "is" : "are"} at risk of being filtered.`
                : ""}
            </p>
            {tab !== "vanished" ? (
              <button
                type="button"
                onClick={() => setTab("vanished")}
                className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-dark"
              >
                See flagged {hasVanished ? "reviews" : "review"} <Icon name="chevron-right" size={14} />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setWatchdogDismissed(true)}
            aria-label="Dismiss durability alert"
            className="grid size-8 shrink-0 place-items-center rounded-btn text-faint hover:bg-black/5 hover:text-ink"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      ) : null}

      <Tabs items={tabs} active={tab} onChange={setTab} />

      {/* Honesty law: the 1–3★ cut always surfaces the public Google link at full parity. */}
      {tab === "low" ? <PublicGoogleReviewLink reviewUrl={business.reviewUrl} prominent /> : null}

      {/* Review list — hairline ledger on desktop, stacked cards on mobile */}
      {sorted.length ? (
        <>
          <div className="hidden lg:block">
            <Table
              columns={columns}
              data={sorted}
              rowKey={(r) => r.id}
              onRowClick={openReply}
              isRowSelected={(r) => active?.id === r.id}
              sort={sort}
              onSortChange={(key, direction) => setSort({ key, direction })}
              stickyHeader
              caption="Reviews — reviewer, rating, status and date"
            />
          </div>
          <div className="space-y-3 lg:hidden">
            {sorted.map((r) => (
              <ReviewCard key={r.id} review={r} onReply={() => openReply(r)} />
            ))}
          </div>
        </>
      ) : (
        <Card>
          <EmptyState
            icon="chat"
            title="No reviews here yet"
            description="When customers post Google reviews, they'll show up here to read and reply to. Send your first request to get the loop going."
          />
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

/**
 * Semantic status-pill system (soft-bg + deep-text): green/replied, danger for
 * needs-action & vanished, gold for at-risk (warning family), neutral info for a
 * detected match. Meaning is always carried by the label + icon, never colour alone.
 */
function ReviewStatusPills({
  review,
  replied,
  needsReply,
  detected,
}: {
  review: Review;
  replied: boolean;
  needsReply: boolean;
  detected: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {review.durability === "vanished" ? (
        <Badge tone="danger" icon="alert">Vanished</Badge>
      ) : review.durability === "at_risk" ? (
        <Badge tone="gold" icon="flag">At risk</Badge>
      ) : null}
      {replied ? (
        <Badge tone="primary" icon="check-circle">Replied</Badge>
      ) : needsReply ? (
        <Badge tone="danger" icon="chat">Needs reply</Badge>
      ) : null}
      {detected ? (
        <span title={MICROCOPY.detectedMatch}>
          <Badge tone="neutral" icon="sparkles">Detected</Badge>
        </span>
      ) : null}
    </div>
  );
}
