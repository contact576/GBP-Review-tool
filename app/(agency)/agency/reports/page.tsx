import { getAgencyClients, getAgencySessionAndData } from "@/lib/data";
import { emailEnabledFor } from "@/lib/email";
import { PageHeader } from "@/components/app/PageHeader";
import { ReportsSender } from "./ReportsSender";

export default async function AgencyReportsPage() {
  const [{ data, session }, clients] = await Promise.all([getAgencySessionAndData(), getAgencyClients()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Client reports"
        sub="Generate and send the branded monthly Growth Report to every client at once."
      />

      <ReportsSender
        clients={clients}
        brandName={data.agency.whiteLabel.brandName}
        deliveryConnected={session.isDemo || (await emailEnabledFor(data.workspace.id))}
      />
    </div>
  );
}
