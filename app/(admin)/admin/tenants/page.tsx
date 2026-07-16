import { getData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { TenantsTable } from "./TenantsTable";

export default async function AdminTenantsPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tenants"
        sub="Every organization on the platform. Search, then impersonate (audited) to debug in their shoes."
      />

      <TenantsTable tenants={data.platform.tenants} />
    </div>
  );
}
