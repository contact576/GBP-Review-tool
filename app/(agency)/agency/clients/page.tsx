import { getAgencyClients, getAgencySessionAndData } from "@/lib/data";
import { INDUSTRY_GROUPS, industriesByGroup } from "@/lib/industries";
import { emailEnabledFor } from "@/lib/email";
import type { PlanTier } from "@/lib/data/types";
import { PageHeader } from "@/components/app/PageHeader";
import { ClientBook } from "./ClientBook";
import { AddAgencyClient, type IndustryGroupOption } from "./AddAgencyClient";

const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  multi: "Multi-location",
  agency: "Agency",
};

export default async function ClientBookPage() {
  const [{ data, session }, clients] = await Promise.all([getAgencySessionAndData(), getAgencyClients()]);
  const byGroup = industriesByGroup();
  const groups: IndustryGroupOption[] = INDUSTRY_GROUPS.map((group) => ({
    label: group.label,
    industries: (byGroup.get(group.key) ?? []).map((industry) => ({ key: industry.key, label: industry.label })),
  })).filter((group) => group.industries.length);
  const deliveryConnected = session.isDemo || (await emailEnabledFor(data.workspace.id));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients"
        sub={`Sort, search, and open any location you manage under ${data.agency.whiteLabel.brandName}. Every figure is read live from the client's own workspace.`}
      />
      <AddAgencyClient
        enabled={!session.isDemo}
        groups={groups}
        defaultRegion={data.workspace.region}
        agencyEmail={session.email || data.owner.email}
      />
      <ClientBook
        clients={clients}
        plans={PLAN_LABELS}
        live={!session.isDemo}
        deliveryConnected={deliveryConnected}
        brandName={data.agency.whiteLabel.brandName}
      />
    </div>
  );
}
