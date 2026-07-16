import { getData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { RequestsView } from "./RequestsView";

export default async function RequestsPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Requests"
        sub="Track every review ask from sent to posted — and send new ones to happy customers."
      />

      <RequestsView
        requests={data.requests}
        customers={data.customers}
        locationId={data.location.id}
      />
    </div>
  );
}
