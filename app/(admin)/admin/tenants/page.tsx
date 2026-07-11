import { getData } from "@/lib/data";
import { TenantsTable } from "./TenantsTable";

export default async function AdminTenantsPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Tenants</h1>
        <p className="text-[14px] text-sub">Every organization on the platform. Search, then impersonate (audited) to debug in their shoes.</p>
      </div>

      <TenantsTable tenants={data.platform.tenants} />
    </div>
  );
}
