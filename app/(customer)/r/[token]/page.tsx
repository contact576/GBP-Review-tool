import { notFound } from "next/navigation";
import { findRequestByToken } from "@/lib/data";
import { resolveServiceOptions, resolveWorkspaceIndustry } from "@/lib/industries";
import { Icon } from "@/components/icons";
import { ReviewFlow } from "./ReviewFlow";

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await findRequestByToken(token);
  if (!result) notFound();

  const { location, staffName, serviceHint, industryKey, industryConfig, request } = result;
  // Industry catalog is the single source of attribute chips, with the owner's
  // own custom values layered in front of the catalog defaults. The customer
  // page re-orders these per service (lib/industries/service-attributes.ts), so
  // positive and neutral chips travel separately.
  const industry = resolveWorkspaceIndustry(industryKey ?? location.vertical, industryConfig);
  // Services are never typed in: real Google profile services first, then the
  // ones read off the business's own website, then (legacy) owner list, and
  // the static catalog only when nothing real exists. Anything the owner
  // switched off in Settings is dropped from every tier.
  const serviceOptions = resolveServiceOptions({
    gbpServiceItems: location.gbpSnapshot?.location.serviceItems,
    websiteServices: location.websiteEvidence?.facts.services,
    ownerServices: industryConfig?.customServices,
    catalogServices: industry.services,
    excluded: industryConfig?.excludedServices,
  });

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
        {location.rating > 0 && location.reviewCount > 0 ? (
          <div className="flex shrink-0 items-center gap-1 text-[12px] text-sub">
            <Icon name="star-fill" size={13} className="text-star" />
            <span className="tabular-nums font-semibold text-ink">{location.rating.toFixed(1)}</span>
            <span className="tabular-nums text-faint">({location.reviewCount.toLocaleString()})</span>
          </div>
        ) : null}
      </header>

      <ReviewFlow
        token={token}
        business={location.name}
        category={location.category}
        industryKey={industry.key}
        service={serviceHint}
        reviewUrl={location.reviewUrl}
        staffName={staffName}
        serviceOptions={serviceOptions.services}
        serviceOptionsSource={serviceOptions.source}
        positiveSeeds={industry.attributes}
        neutralSeeds={industry.neutralAttributes}
        initialStatus={request.status}
        initialRating={request.rating}
      />
    </>
  );
}
