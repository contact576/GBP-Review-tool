import { getData } from "@/lib/data";
import { currencySymbol } from "@/lib/utils/region";
import { EconomicsCalculator } from "./EconomicsCalculator";

export default async function EconomicsPage() {
  const data = await getData();
  const { wholesaleRate, retailAverage, clients } = data.agency;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Economics</h1>
        <p className="text-[14px] text-sub">Model the wholesale-to-retail margin on your book. Prefilled from your current rates.</p>
      </div>

      <EconomicsCalculator
        currencySymbol={currencySymbol(data.workspace.region)}
        defaults={{ locations: clients.length, wholesale: wholesaleRate, retail: retailAverage }}
      />
    </div>
  );
}
