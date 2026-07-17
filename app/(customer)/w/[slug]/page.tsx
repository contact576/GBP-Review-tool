import { getWidgetData } from "@/lib/data";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reviews", robots: { index: false } };

/**
 * Public, embeddable review widget for a business's own website (moat layer 3 /
 * blueprint screen 24). Rendered inside an <iframe>; shows the real aggregate
 * rating + a few recent reviews + a "leave a review" CTA. No account, no
 * session — resolved from the public QR slug.
 */
export default async function WidgetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getWidgetData(slug);

  if (!data) {
    return (
      <div className="mx-auto max-w-md p-6 text-center text-[14px] text-sub">
        This review widget isn&apos;t available.
      </div>
    );
  }

  const full = Math.round(data.rating);

  return (
    <div className="mx-auto max-w-md p-4">
      <div className="rounded-card border border-hairline bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[16px] font-extrabold text-ink">{data.business}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-flex items-center gap-0.5" aria-label={`${data.rating.toFixed(1)} out of 5 stars`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Icon key={n} name="star-fill" size={15} className={n <= full ? "text-star" : "text-hairline"} />
                ))}
              </span>
              <span className="text-[13px] text-sub">
                {data.rating.toFixed(1)} · {data.reviewCount.toLocaleString()} reviews
              </span>
            </div>
          </div>
          {data.reviewUrl ? (
            <a
              href={data.reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-btn bg-primary px-4 text-[13px] font-semibold text-white transition-all hover:bg-primary-dark active:scale-[0.98]"
            >
              Leave a review
            </a>
          ) : null}
        </div>

        {data.reviews.length ? (
          <div className="mt-4 space-y-2.5">
            {data.reviews.slice(0, 3).map((r, i) => (
              <div key={i} className="rounded-btn border border-hairline bg-paper/50 p-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Icon key={n} name="star-fill" size={12} className={n <= r.rating ? "text-star" : "text-hairline"} />
                    ))}
                  </span>
                  <span className="text-[12px] font-semibold text-ink">{r.author}</span>
                </div>
                <p className="mt-1 line-clamp-3 text-[13px] text-sub">{r.text}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
