import { getWidgetData } from "@/lib/data";
import { Icon } from "@/components/icons";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { cn } from "@/lib/utils/cn";
import { formatRelative } from "@/lib/utils/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reviews", robots: { index: false } };

type Layout = "card" | "badge" | "carousel";

function parseLayout(value: string | string[] | undefined): Layout {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "badge" || raw === "carousel" ? raw : "card";
}

function Stars({ rating, size = 15 }: { rating: number; size?: number }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star-fill" size={size} className={n <= full ? "text-star" : "text-hairline"} />
      ))}
    </span>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Public, embeddable review widget for a business's own website. Rendered
 * inside an <iframe> in one of three layouts (`?layout=card|badge|carousel`).
 *
 * Every figure is Google's own aggregate for the linked listing, and every
 * review shown is one that was actually imported from Google and has not
 * vanished — the widget never computes a flattering local average. The
 * "Leave a review" action starts the same guided Foundly session a QR scan
 * does (/q/{slug}), so a website visitor gets the service question, the
 * chips and the wording help; "Read all on Google" goes straight to Google.
 * No account, no session — resolved from the public QR slug.
 */
export default async function WidgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const layout = parseLayout((await searchParams).layout);
  const data = await getWidgetData(slug);

  if (!data) {
    return (
      <div className="mx-auto max-w-md p-6 text-center text-[14px] text-sub">
        This review widget isn&apos;t available.
      </div>
    );
  }

  const hasAggregate = data.googleLinked && data.reviewCount > 0 && data.rating > 0;
  const startUrl = `/q/${encodeURIComponent(data.slug)}`;

  // ── Badge: one line, sits in a footer or beside a heading ──
  if (layout === "badge") {
    return (
      <div className="p-2">
        <a
          href={startUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-3 rounded-card border border-hairline bg-card px-3.5 py-2.5 shadow-sm transition-colors hover:border-primary/40"
          aria-label={hasAggregate ? `${data.business}: rated ${data.rating.toFixed(1)} from ${data.reviewCount} Google reviews. Leave a review.` : `Leave a review for ${data.business}`}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-btn bg-hero text-white">
            <Icon name="google" size={18} />
          </span>
          <span className="min-w-0">
            {hasAggregate ? (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="text-[16px] font-extrabold tabular-nums leading-none text-ink">{data.rating.toFixed(1)}</span>
                  <Stars rating={data.rating} size={13} />
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-sub">
                  <span className="tabular-nums">{data.reviewCount.toLocaleString()}</span> Google reviews · Leave yours
                </span>
              </>
            ) : (
              <>
                <span className="block text-[13px] font-bold leading-none text-ink">Review {data.business}</span>
                <span className="mt-0.5 block text-[11px] text-sub">Takes about a minute</span>
              </>
            )}
          </span>
          <Icon name="chevron-right" size={16} className="shrink-0 text-faint" />
        </a>
      </div>
    );
  }

  const reviews = layout === "carousel" ? data.reviews.slice(0, 8) : data.reviews.slice(0, 3);

  return (
    <div className={cn("mx-auto p-3", layout === "carousel" ? "max-w-3xl" : "max-w-md")}>
      <div className="overflow-hidden rounded-card border border-hairline bg-card shadow-sm">
        {/* Header — the aggregate, honestly labelled */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <div className="truncate text-[16px] font-extrabold text-ink">{data.business}</div>
            {hasAggregate ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-[22px] font-extrabold tabular-nums leading-none tracking-tight text-ink">
                  {data.rating.toFixed(1)}
                </span>
                <Stars rating={data.rating} />
                <span className="text-[13px] text-sub">
                  <span className="tabular-nums">{data.reviewCount.toLocaleString()}</span> Google reviews
                </span>
              </div>
            ) : (
              <div className="mt-1 text-[13px] text-sub">
                {data.city ? `${data.city} · ` : ""}Reviews on Google
              </div>
            )}
          </div>
          <a
            href={startUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-btn bg-primary px-4 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-primary-dark active:scale-[0.98]"
          >
            <Icon name="pencil" size={15} /> Leave a review
          </a>
        </div>

        {/* Reviews */}
        {reviews.length ? (
          layout === "carousel" ? (
            <div
              className="no-scrollbar mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1"
              role="list"
              aria-label="Recent reviews"
            >
              {reviews.map((review, index) => (
                <article
                  key={`${review.author}-${index}`}
                  role="listitem"
                  className="w-[260px] shrink-0 snap-start rounded-card border border-hairline bg-paper/60 p-3.5"
                >
                  <ReviewHead author={review.author} rating={review.rating} publishedAt={review.publishedAt} />
                  <p className="mt-2 line-clamp-5 text-[13px] leading-relaxed text-ink/90">{review.text}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-2.5 px-5" role="list" aria-label="Recent reviews">
              {reviews.map((review, index) => (
                <article key={`${review.author}-${index}`} role="listitem" className="rounded-btn border border-hairline bg-paper/60 p-3">
                  <ReviewHead author={review.author} rating={review.rating} publishedAt={review.publishedAt} />
                  <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-ink/90">{review.text}</p>
                </article>
              ))}
            </div>
          )
        ) : (
          <div className="mx-5 mt-4 rounded-btn border border-dashed border-hairline bg-paper/60 px-3 py-4 text-center text-[13px] text-sub">
            {hasAggregate
              ? "Recent reviews appear here once they are synced from Google."
              : "Be one of the first to share your experience."}
          </div>
        )}

        {/* Footer — read on Google + attribution */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-hairline bg-paper/40 px-5 py-3">
          {data.reviewUrl ? (
            <a
              href={data.reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[36px] items-center gap-1.5 text-[12px] font-semibold text-primary-dark underline-offset-2 hover:underline"
            >
              <Icon name="google" size={14} /> Read all on Google <Icon name="external" size={12} className="text-faint" />
            </a>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-faint">
            <span className="grid size-4 place-items-center rounded-[5px] bg-hero text-gold">
              <Icon name="sparkles" size={10} />
            </span>
            {MICROCOPY.poweredByFoundly}
          </span>
        </div>
      </div>
    </div>
  );
}

function ReviewHead({ author, rating, publishedAt }: { author: string; rating: number; publishedAt: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-chip bg-primary-tint text-[11px] font-bold text-primary-dark">
        {initialsOf(author)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-semibold text-ink">{author}</div>
        <div className="flex items-center gap-1.5">
          <Stars rating={rating} size={11} />
          <span className="text-[11px] text-faint">{formatRelative(publishedAt)}</span>
        </div>
      </div>
    </div>
  );
}
