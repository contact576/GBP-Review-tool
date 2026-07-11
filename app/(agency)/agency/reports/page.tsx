import { getData } from "@/lib/data";
import { ReportsSender } from "./ReportsSender";

export default async function AgencyReportsPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Reports</h1>
        <p className="text-[14px] text-sub">Generate and send the branded monthly Growth Report to every client at once.</p>
      </div>

      <ReportsSender clients={data.agency.clients} brandName={data.agency.whiteLabel.brandName} />
    </div>
  );
}
