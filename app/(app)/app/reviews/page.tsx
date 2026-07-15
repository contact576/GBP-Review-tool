import { getData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { formatRelative } from "@/lib/utils/format";
import { ReviewsInbox } from "./ReviewsInbox";
import { ResolveFeedback } from "./ResolveFeedback";

export default async function ReviewsPage() {
  const data = await getData();
  const unresolvedFeedback = data.privateFeedback.filter((f) => !f.resolved);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[24px] font-extrabold text-ink lg:text-[28px]">Reviews</h1>
        <p className="text-[15px] text-sub">
          Every review in one place. Reply in your voice — we draft, you approve.
        </p>
      </div>

      {unresolvedFeedback.length > 0 ? (
        <Card className="border-gold/40">
          <CardHeader
            title="Private feedback"
            action={<Badge tone="gold" icon="alert">{unresolvedFeedback.length} open</Badge>}
          />
          <div className="divide-y divide-hairline">
            {unresolvedFeedback.map((f) => (
              <div key={f.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-btn bg-gold-tint text-gold-deep">
                  <Icon name="chat" size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold text-ink">{f.customerName}</span>
                    <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-gold-deep">
                      <Icon name="star-fill" size={12} /> {f.rating}
                    </span>
                    <span className="text-[11px] text-faint">{formatRelative(f.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-[14px] text-sub">{f.text}</p>
                </div>
                <ResolveFeedback id={f.id} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <ReviewsInbox
        reviews={data.reviews}
        business={{
          name: data.location.name,
          rating: data.location.rating,
          reviewCount: data.location.reviewCount,
        }}
      />
    </div>
  );
}
