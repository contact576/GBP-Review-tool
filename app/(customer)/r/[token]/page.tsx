import { notFound } from "next/navigation";
import { getDataProvider } from "@/lib/data";
import { Wordmark } from "@/components/app/AppShell";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { ReviewFlow } from "./ReviewFlow";
import type { Vertical } from "@/lib/data/types";

const ATTRS: Record<Vertical, string[]> = {
  physiotherapy: ["Friendly staff", "Got results", "Easy booking", "On time", "Clear explanations", "Direct billing"],
  chiropractic: ["Pain relief", "Gentle care", "Friendly staff", "On time", "Clear plan", "Easy booking"],
  dental: ["Painless visit", "Gentle staff", "Clean clinic", "On time", "Explained everything", "Fair pricing"],
  hvac: ["On time", "Fair pricing", "Fixed it fast", "Tidy work", "Friendly tech", "Explained the issue"],
  renovation: ["Quality work", "On schedule", "Great communication", "Tidy site", "Fair pricing", "Would rehire"],
  salon: ["Loved the result", "Friendly stylist", "Relaxing", "On time", "Great value", "Easy booking"],
  restaurant: ["Great food", "Friendly service", "Fast service", "Great value", "Cozy vibe", "Would return"],
};

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const provider = await getDataProvider();
  const result = await provider.getRequestByToken(token);
  if (!result) notFound();

  const { location } = result;
  const seeds = ATTRS[location.vertical] ?? ATTRS.physiotherapy;

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
        reviewUrl={location.reviewUrl}
        staffName={result.request.staffId ? undefined : undefined}
        attributeSeeds={seeds}
      />

      <footer className="border-t border-hairline py-4 text-center">
        <span className="text-[11px] text-faint">{MICROCOPY.poweredByFoundly}</span>
        <div className="mt-1 flex justify-center opacity-60"><Wordmark small /></div>
      </footer>
    </>
  );
}
