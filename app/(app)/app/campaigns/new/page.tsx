import { getData } from "@/lib/data";
import { LinkButton } from "@/components/ds/Button";
import { CampaignComposer } from "./CampaignComposer";

export default async function NewCampaignPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <div>
        <LinkButton href="/app/campaigns" variant="ghost" size="sm" icon="chevron-left" className="-ml-2 mb-1">
          Campaigns
        </LinkButton>
        <h1 className="text-[24px] font-extrabold text-ink lg:text-[28px]">New campaign</h1>
        <p className="text-[15px] text-sub">A consent-safe send — we compute who&apos;s eligible before anything goes out.</p>
      </div>

      <CampaignComposer
        customers={data.customers}
        business={data.location.name}
        locationId={data.location.id}
      />
    </div>
  );
}
