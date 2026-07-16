import { getData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { FlagsTable } from "./FlagsTable";

export default async function AdminFlagsPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Feature flags"
        sub="Roll capabilities out by cohort. Toggles are local in this demo — no tenant is affected."
      />

      <FlagsTable flags={data.featureFlags} />
    </div>
  );
}
