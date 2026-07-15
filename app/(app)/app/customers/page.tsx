import { getData } from "@/lib/data";
import { CustomersView } from "./CustomersView";

export default async function CustomersPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[24px] font-extrabold text-ink lg:text-[28px]">Customers</h1>
        <p className="text-[15px] text-sub">
          Your people, their consent, and their history — always yours to export.
        </p>
      </div>

      <CustomersView
        customers={data.customers}
        requests={data.requests}
        region={data.location.region}
        locationId={data.location.id}
      />
    </div>
  );
}
