import { getData } from "@/lib/data";
import type { PlanTier } from "@/lib/data/types";
import { ClientBook } from "./ClientBook";

const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
  multi: "Multi-location",
  agency: "Agency",
};

export default async function ClientBookPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Client book</h1>
        <p className="text-[14px] text-sub">Sort, search, and open any location you manage under {data.agency.whiteLabel.brandName}.</p>
      </div>

      <ClientBook clients={data.agency.clients} plans={PLAN_LABELS} />
    </div>
  );
}
