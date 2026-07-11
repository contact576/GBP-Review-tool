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
        <h1 className="text-[22px] font-extrabold text-ink">New campaign</h1>
        <p className="text-[14px] text-sub">
          A quick, consent-safe send. We compute exactly who is eligible before anything goes out.
        </p>
      </div>

      <CampaignComposer
        customers={data.customers}
        business={data.location.name}
        locationId={data.location.id}
      />
    </div>
  );
}
