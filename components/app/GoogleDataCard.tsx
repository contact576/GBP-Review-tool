import type { FoundlyData } from "@/lib/data/types";
import type { DashboardSignal } from "@/lib/data/dashboard";
import { Icon } from "@/components/icons";
import { LinkButton } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { SyncGoogleButton } from "./SyncGoogleButton";
import { formatRelative } from "@/lib/utils/format";
import { isImportedGoogleReview, isGbpReview } from "@/lib/google/public-sync";

/** Compact source-of-truth panel for public listing and GBP review data. */
export function GoogleDataCard({
  data,
  newReviews,
}: {
  data: FoundlyData;
  newReviews: DashboardSignal;
}) {
  const loc = data.location;
  const imported = data.reviews.filter((review) => isImportedGoogleReview(review.id));
  const recent = imported[0];
  const hasGbpReviews = data.reviews.some((review) => isGbpReview(review.id));
  const google = data.integrations.find((integration) => integration.provider === "google");
  const places = data.integrations.find((integration) => integration.provider === "google_places");
  const pendingApproval = google?.status === "pending" || google?.status === "needs_attention";

  if (!loc.googlePlaceId) {
    return (
      <section className="flex h-full min-h-[430px] flex-col rounded-card border border-hairline bg-card p-5 shadow-sm sm:p-6">
        <Header badge={<Badge tone="sub" icon="lock">Not matched</Badge>} />
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <span className="grid size-14 place-items-center rounded-card bg-primary-wash text-primary">
            <Icon name="google" size={25} />
          </span>
          <h3 className="mt-4 text-[17px] font-bold text-ink">Find your Google listing</h3>
          <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-sub">
            Match the public listing to verify your rating, review count, and local growth score.
          </p>
          <LinkButton href="/onboarding/find-business" size="sm" icon="search" className="mt-5">
            Find your business
          </LinkButton>
        </div>
        <SourceFoot source="No Google source connected" />
      </section>
    );
  }

  const publicListingReady = Boolean(loc.reviewCount || imported.length || places?.status === "connected");
  const statusLabel = pendingApproval
    ? "GBP pending"
    : hasGbpReviews
      ? "GBP connected"
      : "Public listing";
  const statusTone = pendingApproval ? "gold" : publicListingReady ? "primary" : "sub";
  const lastSyncAt = [google?.lastSyncAt, places?.lastSyncAt].filter(Boolean).sort().pop();

  return (
    <section className="flex h-full min-h-[430px] flex-col rounded-card border border-hairline bg-card p-5 shadow-sm sm:p-6">
      <Header badge={<Badge tone={statusTone} icon={pendingApproval ? "clock" : "check-circle"}>{statusLabel}</Badge>} />

      {publicListingReady ? (
        <>
          <div className="mt-6 rounded-card border border-hairline bg-paper/60 p-4">
            <div className="kicker">Google reputation</div>
            <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
              <span className="text-[40px] font-extrabold leading-none tracking-[-0.04em] text-ink tabular-nums">
                {loc.rating.toFixed(1)}
              </span>
              <div className="pb-0.5">
                <Stars rating={loc.rating} />
                <div className="mt-1 text-[12px] text-faint">
                  {loc.reviewCount.toLocaleString()} Google review{loc.reviewCount === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-btn border border-hairline p-3">
              <div className="data-chip text-faint">NEW REVIEWS</div>
              <div className="mt-1 text-[23px] font-extrabold text-ink tabular-nums">
                {newReviews.value === null ? "—" : newReviews.value}
              </div>
              <div className="text-[11px] text-faint">rolling 30 days</div>
            </div>
            <div className="rounded-btn border border-hairline p-3">
              <div className="data-chip text-faint">REVIEW SOURCE</div>
              <div className="mt-1 truncate text-[13px] font-bold text-ink">
                {hasGbpReviews ? "Business Profile" : "Public sample"}
              </div>
              <div className="mt-1 text-[11px] text-faint">
                {hasGbpReviews ? "authorized history" : "not full history"}
              </div>
            </div>
          </div>

          {recent ? (
            <div className="mt-4 border-t border-hairline pt-4">
              <div className="flex items-center justify-between gap-2">
                <div className="kicker">Latest imported review</div>
                <Stars rating={recent.rating} small />
              </div>
              <div className="mt-2 text-[13px] font-semibold text-ink">{recent.author}</div>
              {recent.text ? <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-sub">{recent.text}</p> : null}
            </div>
          ) : (
            <p className="mt-4 rounded-btn bg-primary-wash p-3 text-[12px] leading-relaxed text-sub">
              {pendingApproval
                ? "Google Business Profile access is pending. Public listing data remains available while you review the connection."
                : "The public rating is ready. Connect the managing Google account to request authorized review history and performance access."}
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <Icon name="refresh" size={25} className="text-primary" />
          <h3 className="mt-3 text-[16px] font-bold text-ink">Listing matched, first sync pending</h3>
          <p className="mt-1 max-w-xs text-[13px] text-sub">Refresh to request the latest public Google listing data.</p>
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-4">
        <SourceFoot
          source={hasGbpReviews ? "Google Business Profile reviews" : "Google public listing"}
          updated={lastSyncAt ? formatRelative(lastSyncAt) : undefined}
        />
        <SyncGoogleButton label={publicListingReady ? "Refresh" : "Sync Google"} variant="secondary" />
      </div>
    </section>
  );
}

function Header({ badge }: { badge: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-btn bg-primary-wash">
          <Icon name="google" size={18} />
        </span>
        <div>
          <div className="kicker">Connected source</div>
          <h2 className="text-[16px] font-bold text-ink">Your Google data</h2>
        </div>
      </div>
      {badge}
    </div>
  );
}

function SourceFoot({ source, updated }: { source: string; updated?: string }) {
  return (
    <div className="min-w-0 text-[11px] text-faint">
      <div className="flex items-center gap-1.5 font-medium text-sub">
        <Icon name="shield" size={12} /> <span className="truncate">{source}</span>
      </div>
      <div className="mt-0.5">{updated ? `Updated ${updated}` : "No verified sync yet"}</div>
    </div>
  );
}

function Stars({ rating, small }: { rating: number; small?: boolean }) {
  const size = small ? 12 : 15;
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((number) => (
        <Icon
          key={number}
          name="star-fill"
          size={size}
          className={number <= full ? "text-star" : "text-hairline"}
        />
      ))}
    </span>
  );
}
