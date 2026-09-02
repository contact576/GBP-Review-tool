import { getAgencyData } from "@/lib/data";
import { currencySymbol } from "@/lib/utils/region";
import { PageHeader } from "@/components/app/PageHeader";
import { EconomicsCalculator } from "./EconomicsCalculator";

export default async function EconomicsPage() {
  const data = await getAgencyData();
  const { wholesaleRate, retailAverage, clients } = data.agency;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Economics"
        sub="Model the wholesale-to-retail margin on your book. Prefilled from your current rates."
      />

      <EconomicsCalculator
        currencySymbol={currencySymbol(data.workspace.region)}
        defaults={{ locations: clients.length, wholesale: wholesaleRate, retail: retailAverage }}
      />
    </div>
  );
}
