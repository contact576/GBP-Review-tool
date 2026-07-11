import { getData } from "@/lib/data";
import { ReviewsInbox } from "./ReviewsInbox";

export default async function ReviewsPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Reviews</h1>
        <p className="text-[14px] text-sub">
          Every review in one place. Reply in your voice — we draft, you approve.
        </p>
      </div>

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
