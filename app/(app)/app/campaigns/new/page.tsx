import { getData } from "@/lib/data";
import { LinkButton } from "@/components/ds/Button";
import { PageHeader } from "@/components/app/PageHeader";
import { CampaignComposer } from "./CampaignComposer";

export default async function NewCampaignPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <div>
        <LinkButton href="/app/campaigns" variant="ghost" size="sm" icon="chevron-left" className="-ml-2 mb-1">
          Campaigns
        </LinkButton>
        <PageHeader
          title="New campaign"
          sub={<>A consent-safe send — we compute who&apos;s eligible before anything goes out.</>}
        />
      </div>

      <CampaignComposer
        customers={data.customers}
        business={data.location.name}
        locationId={data.location.id}
      />
    </div>
  );
}
