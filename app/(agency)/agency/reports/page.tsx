import { getData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { ReportsSender } from "./ReportsSender";

export default async function AgencyReportsPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Client reports"
        sub="Generate and send the branded monthly Growth Report to every client at once."
      />

      <ReportsSender clients={data.agency.clients} brandName={data.agency.whiteLabel.brandName} />
    </div>
  );
}
