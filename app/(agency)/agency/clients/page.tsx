import { getAgencyClients, getAgencySessionAndData } from "@/lib/data";
import type { PlanTier } from "@/lib/data/types";
import { PageHeader } from "@/components/app/PageHeader";
import { ClientBook } from "./ClientBook";
import { AddAgencyClient } from "./AddAgencyClient";

const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  multi: "Multi-location",
  agency: "Agency",
};

export default async function ClientBookPage() {
  const [{ data, session }, clients] = await Promise.all([getAgencySessionAndData(), getAgencyClients()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Client book"
        sub={`Sort, search, and open any location you manage under ${data.agency.whiteLabel.brandName}.`}
      />
      <AddAgencyClient enabled={!session.isDemo} />
      <ClientBook clients={clients} plans={PLAN_LABELS} />
    </div>
  );
}
