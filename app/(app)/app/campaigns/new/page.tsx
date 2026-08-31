import { getData } from "@/lib/data";
import { LinkButton } from "@/components/ds/Button";
import { PageHeader } from "@/components/app/PageHeader";
import { emailEnabled } from "@/lib/email";
import { smsEnabled } from "@/lib/sms/twilio";
import { CampaignComposer } from "./CampaignComposer";

export default async function NewCampaignPage() {
  const data = await getData();

  // Provider readiness is resolved here, on the server, from the real env — so
  // the composer can say "this cannot send yet" before the owner writes a word
  // rather than after they press Send.
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
        suppression={data.suppression}
        usage={data.subscription.usage}
        business={data.location.name}
        locationId={data.location.id}
        ownerEmail={data.owner.email}
        emailReady={emailEnabled()}
        smsReady={smsEnabled()}
      />
    </div>
  );
}
