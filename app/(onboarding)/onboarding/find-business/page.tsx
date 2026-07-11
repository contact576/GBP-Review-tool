import { getData } from "@/lib/data";
import { Badge, Card, Input } from "@/components/ds";
import { Icon } from "@/components/icons";
import { Step } from "../_components/Step";

export default async function FindBusinessPage() {
  const { location } = await getData();

  return (
    <Step
      current={1}
      eyebrow="Step 1 of 7"
      title="Find your business on Google"
      subtitle="We matched your Google Business Profile — confirm it's the right one and we'll wire everything to it."
      continueHref="/onboarding/business-type"
      continueLabel="Yes, that's me"
      skipHref="/onboarding/business-type"
    >
      <div className="space-y-4">
        <Input
          iconLeft="search"
          defaultValue="Harbourview Physiotherapy"
          aria-label="Search for your business on Google"
        />

        <Card className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-btn bg-primary-tint text-primary-dark">
              <Icon name="map-pin" size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate text-[15px] font-bold text-ink">{location.name}</div>
                <Badge tone="primary" icon="check">Match</Badge>
              </div>
              <div className="mt-0.5 text-[13px] text-sub">
                {location.address}, {location.city}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink">
                  <Icon name="star-fill" size={14} className="text-star" />
                  {location.rating.toFixed(1)}
                  <span className="font-normal text-faint">· {location.reviewCount} reviews</span>
                </span>
                <Badge tone="neutral">{location.category}</Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-btn bg-primary-wash px-3 py-2 text-[12px] text-sub">
            <Icon name="check-circle" size={15} className="shrink-0 text-primary" />
            Verified listing · connected to Google Maps &amp; Search
          </div>
        </Card>

        <p className="text-[12px] text-faint">
          Not your business? Edit the search above and we&apos;ll re-match.
        </p>
      </div>
    </Step>
  );
}
