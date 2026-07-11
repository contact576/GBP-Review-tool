import { getData } from "@/lib/data";
import { RequestsView } from "./RequestsView";

export default async function RequestsPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Requests</h1>
        <p className="text-[14px] text-sub">
          Track every review ask from sent to posted — and send new ones to happy customers.
        </p>
      </div>

      <RequestsView
        requests={data.requests}
        customers={data.customers}
        locationId={data.location.id}
      />
    </div>
  );
}
