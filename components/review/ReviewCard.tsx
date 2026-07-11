import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ds/misc";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import type { Review } from "@/lib/data/types";
import { formatRelative } from "@/lib/utils/format";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name={n <= rating ? "star-fill" : "star"} size={14} className={n <= rating ? "text-star" : "text-hairline"} />
      ))}
    </span>
  );
}

export function ReviewCard({
  review, onReply, onOpen,
}: {
  review: Review; onReply?: () => void; onOpen?: () => void;
}) {
  return (
    <div className="rounded-card border border-hairline bg-card p-4" onClick={onOpen}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-chip bg-primary-tint text-[13px] font-bold text-primary-dark">
            {review.author.split(" ").map((w) => w[0]).join("").slice(0, 2)}
          </div>
          <div>
            <div className="text-[14px] font-semibold text-ink">{review.author}</div>
            <div className="flex items-center gap-2">
              <Stars rating={review.rating} />
              <span className="text-[12px] text-faint">{formatRelative(review.publishedAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {review.durability === "vanished" ? (
            <Badge tone="danger" icon="alert">Vanished</Badge>
          ) : review.durability === "at_risk" ? (
            <Badge tone="gold" icon="flag">At risk</Badge>
          ) : null}
          {review.matchedRequestId ? (
            <span className="text-[11px] text-faint" title={MICROCOPY.detectedMatch}>Detected</span>
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-[14px] leading-relaxed text-ink/90">{review.text}</p>

      {review.reply ? (
        <div className="mt-3 rounded-btn border-l-2 border-primary/40 bg-primary-wash/60 px-3 py-2">
          <div className="kicker mb-0.5">Your reply</div>
          <p className="text-[13px] text-sub">{review.reply.text}</p>
        </div>
      ) : review.needsReply ? (
        <div className="mt-3 flex items-center justify-between">
          <Badge tone="gold" icon="chat">Needs reply</Badge>
          {onReply ? (
            <button
              onClick={(e) => { e.stopPropagation(); onReply(); }}
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-dark"
            >
              Reply <Icon name="chevron-right" size={14} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export { Stars };
