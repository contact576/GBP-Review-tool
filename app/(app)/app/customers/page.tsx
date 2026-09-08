import { getSessionAndData } from "@/lib/data";
import { emailEnabledFor } from "@/lib/email";
import { smsEnabled } from "@/lib/sms/twilio";
import { PageHeader } from "@/components/app/PageHeader";
import { CustomersView } from "./CustomersView";

export default async function CustomersPage() {
  const { session, data } = await getSessionAndData();
  // Channel readiness is resolved here, from the same adapters the send path
  // uses, so the picker in the drawer can never offer a channel that would
  // fail. Email can be switched on per workspace (Settings → Channels). The
  // demo simulates delivery, so both read as ready there.
  const emailReady = session.isDemo ? true : await emailEnabledFor(session.workspaceId);
  const smsReady = session.isDemo ? true : smsEnabled();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        sub="Your people, their consent, and their history — always yours to export. Add someone and ask for a review in the same breath."
      />

      <CustomersView
        customers={data.customers}
        requests={data.requests}
        region={data.location.region}
        locationId={data.location.id}
        business={data.location.name}
        emailReady={emailReady}
        smsReady={smsReady}
      />
    </div>
  );
}
