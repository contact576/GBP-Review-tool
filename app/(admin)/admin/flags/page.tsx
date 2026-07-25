import { getData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ds/misc";
import { FlagsTable } from "./FlagsTable";

export default async function AdminFlagsPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Feature flags"
        sub="Flags stored on this workspace's own record — toggling one persists and affects this workspace only. There is no cross-tenant rollout mechanism in this deployment, so cohort targeting is a label, not a control."
        actions={<Badge tone="sub" icon="lock">Scope · this workspace</Badge>}
      />

      <FlagsTable flags={data.featureFlags} />
    </div>
  );
}
