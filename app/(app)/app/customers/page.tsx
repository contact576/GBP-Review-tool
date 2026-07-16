import { getData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { CustomersView } from "./CustomersView";

export default async function CustomersPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        sub="Your people, their consent, and their history — always yours to export."
      />

      <CustomersView
        customers={data.customers}
        requests={data.requests}
        region={data.location.region}
        locationId={data.location.id}
      />
    </div>
  );
}
