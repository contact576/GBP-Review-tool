import { notFound } from "next/navigation";
import { findRequestByToken } from "@/lib/data";
import { resolveWorkspaceIndustry } from "@/lib/industries";
import { Wordmark } from "@/components/app/AppShell";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { ReviewFlow } from "./ReviewFlow";

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await findRequestByToken(token);
  if (!result) notFound();

  const { location, staffName, serviceHint } = result;
  // Industry catalog is the single source of attribute chips — positive
  // chips first, then the neutral/experience chips.
  const industry = resolveWorkspaceIndustry(location.vertical, undefined);
  const seeds = [...industry.attributes, ...industry.neutralAttributes];

  return (
    <>
      <header className="flex items-center justify-between border-b border-hairline py-4">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-btn bg-hero text-white font-bold">
            {location.name.slice(0, 1)}
          </div>
          <div>
            <div className="text-[15px] font-bold text-ink leading-tight">{location.name}</div>
            <div className="text-[12px] text-faint">{location.city}</div>
          </div>
        </div>
      </header>

      <ReviewFlow
        token={token}
        business={location.name}
        category={location.category}
        industryKey={location.vertical}
        service={serviceHint}
        reviewUrl={location.reviewUrl}
        staffName={staffName}
        attributeSeeds={seeds}
      />

      <footer className="border-t border-hairline py-4 text-center">
        <span className="text-[11px] text-faint">{MICROCOPY.poweredByFoundly}</span>
        <div className="mt-1 flex justify-center opacity-60"><Wordmark small /></div>
      </footer>
    </>
  );
}
