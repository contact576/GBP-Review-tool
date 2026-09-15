import { getAgencyClients, getAgencySessionAndData } from "@/lib/data";
import { emailEnabledFor } from "@/lib/email";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ds/misc";
import { ReportsSender } from "./ReportsSender";
import { isReportOverdue } from "../../_components/portfolio";

export default async function AgencyReportsPage() {
  const [{ data, session }, clients] = await Promise.all([getAgencySessionAndData(), getAgencyClients()]);
  const deliveryConnected = session.isDemo || (await emailEnabledFor(data.workspace.id));
  const overdue = clients.filter((client) => isReportOverdue(client)).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Client reports"
        sub="Preview and send the branded Growth Report to one client or every client at once. Reports are sent when you press send — there is no automatic schedule in this deployment."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={deliveryConnected ? "primary" : "gold"} icon="mail">
              {deliveryConnected ? "Email sender connected" : "No email sender"}
            </Badge>
            <Badge tone={overdue ? "gold" : "primary"} icon="file">
              {overdue ? `${overdue} overdue` : "All current"}
            </Badge>
          </div>
        }
      />

      <ReportsSender
        clients={clients}
        brandName={data.agency.whiteLabel.brandName}
        deliveryConnected={deliveryConnected}
      />
    </div>
  );
}
