import { notFound } from "next/navigation";
import { findRequestByToken } from "@/lib/data";
import { resolveWorkspaceIndustry } from "@/lib/industries";
import { Icon } from "@/components/icons";
import { ReviewFlow } from "./ReviewFlow";

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await findRequestByToken(token);
  if (!result) notFound();

  const { location, staffName, serviceHint, industryKey, industryConfig, request } = result;
  // Industry catalog is the single source of services and attribute chips, with
  // the owner's own custom values layered in front of the catalog defaults.
  // Positive chips come first, then the neutral/experience chips.
  const industry = resolveWorkspaceIndustry(industryKey ?? location.vertical, industryConfig);
  const seeds = [...industry.attributes, ...industry.neutralAttributes];

  return (
    <>
      <header className="flex items-center gap-3 border-b border-hairline py-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-btn bg-hero text-[17px] font-extrabold text-white">
          {location.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold leading-tight text-ink">{location.name}</div>
          <div className="flex items-center gap-1 text-[12px] text-faint">
            <Icon name="map-pin" size={12} />
            <span className="truncate">{location.city}</span>
          </div>
        </div>
      </header>

      <ReviewFlow
        token={token}
        business={location.name}
        category={location.category}
        industryKey={industry.key}
        service={serviceHint}
        reviewUrl={location.reviewUrl}
        staffName={staffName}
        serviceOptions={industry.services}
        attributeSeeds={seeds}
        initialStatus={request.status}
        initialRating={request.rating}
      />
    </>
  );
}
