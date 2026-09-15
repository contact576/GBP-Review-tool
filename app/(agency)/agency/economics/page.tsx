import { getAgencyClients, getAgencySessionAndData } from "@/lib/data";
import { currencySymbol } from "@/lib/utils/region";
import { PageHeader } from "@/components/app/PageHeader";
import { EconomicsCalculator } from "./EconomicsCalculator";

export default async function EconomicsPage() {
  const [{ data, session }, clients] = await Promise.all([getAgencySessionAndData(), getAgencyClients()]);
  const { wholesaleRate, retailAverage } = data.agency;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Economics"
        sub="Model the wholesale-to-retail margin on your book. Prefilled from your saved rates and your live client count."
      />

      <EconomicsCalculator
        currencySymbol={currencySymbol(data.workspace.region)}
        defaults={{ locations: clients.length, wholesale: wholesaleRate, retail: retailAverage }}
        canSave={!session.isDemo}
      />
    </div>
  );
}
