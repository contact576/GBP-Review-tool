import type { FoundlyData } from "@/lib/data/types";
import { Icon } from "@/components/icons";
import { LinkButton } from "@/components/ds/Button";
import { SyncGoogleButton } from "./SyncGoogleButton";
import { isImportedGoogleReview, isGbpReview } from "@/lib/google/public-sync";

/**
 * Real Google data on the dashboard: the aggregate rating + total review count
 * (both complete), plus a labeled sample of recent reviews. Honest about what's
 * public-sample vs full Business-Profile history.
 */
export function GoogleDataCard({ data }: { data: FoundlyData }) {
  const loc = data.location;
  const imported = data.reviews.filter((r) => isImportedGoogleReview(r.id)).slice(0, 3);
  const hasGbp = data.reviews.some((r) => isGbpReview(r.id));
  const google = data.integrations.find((i) => i.provider === "google");
  const pendingApproval = google?.status === "needs_attention";

  // No Google listing matched yet.
  if (!loc.googlePlaceId) {
    return (
      <div className="rounded-card border border-hairline bg-card p-5 shadow-sm">
        <Header />
        <p className="mt-1 text-[14px] text-sub">
          Match your business on Google to pull your real rating, reviews and score.
        </p>
        <LinkButton href="/onboarding/find-business" size="sm" icon="search" className="mt-3">
          Find your business
        </LinkButton>
      </div>
    );
  }

  const synced = loc.reviewCount > 0 || imported.length > 0;

  return (
    <div className="rounded-card border border-hairline bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <Header />
        <SyncGoogleButton
          label={synced ? "Refresh" : "Sync from Google"}
          variant={synced ? "secondary" : "primary"}
        />
      </div>

      {synced ? (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[34px] font-extrabold leading-none text-ink">
              {loc.rating.toFixed(1)}
            </span>
            <Stars rating={loc.rating} />
            <span className="text-[14px] text-sub">
              · {loc.reviewCount.toLocaleString()} Google review{loc.reviewCount === 1 ? "" : "s"}
            </span>
          </div>

          {imported.length ? (
            <div className="mt-4 space-y-2.5">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-faint">
                {hasGbp
                  ? "From your Google Business Profile"
                  : `Recent public reviews · sample of ${loc.reviewCount.toLocaleString()}`}
              </div>
              {imported.map((r) => (
                <div key={r.id} className="rounded-btn border border-hairline bg-paper/50 p-3">
                  <div className="flex items-center gap-2">
                    <Stars rating={r.rating} small />
                    <span className="text-[13px] font-semibold text-ink">{r.author}</span>
                  </div>
                  {r.text ? <p className="mt-1 line-clamp-3 text-[13px] text-sub">{r.text}</p> : null}
                </div>
              ))}
            </div>
          ) : null}

          {!hasGbp ? (
            <p className="mt-4 rounded-btn bg-primary-wash/60 p-3 text-[13px] text-sub">
              {pendingApproval
                ? "Your full review history and performance import automatically once Google approves your Business Profile connection (typically 1–2 weeks)."
                : "This is your public Google data. Connect your Google Business Profile in Settings → Integrations to import your full review history and performance."}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-[14px] text-sub">
          Pull your real Google rating, total review count and a sample of recent reviews.
        </p>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2">
      <Icon name="google" size={18} />
      <h2 className="text-[16px] font-bold text-ink">Your Google data</h2>
    </div>
  );
}

function Stars({ rating, small }: { rating: number; small?: boolean }) {
  const size = small ? 13 : 16;
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name="star-fill"
          size={size}
          className={n <= full ? "text-star" : "text-hairline"}
        />
      ))}
    </span>
  );
}
