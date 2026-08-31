import { getSessionAndData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import {
  MonitoringCallout,
  NotMeasuredPanel,
  TelemetrySourceBadge,
  readPlatformTelemetry,
} from "../../_components/telemetry";
import { ImpersonationNotice, TenantsTable } from "./TenantsTable";

export default async function AdminTenantsPage() {
  const { session, data } = await getSessionAndData();
  const telemetry = readPlatformTelemetry(data.platform, session.isDemo);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tenants"
        sub={
          telemetry.measured
            ? "Every organization on the platform. Search to find an account, then open it in the tenant's own console."
            : "The tenant roster is built from platform aggregates this deployment never computes, so no roster is shown."
        }
        actions={<TelemetrySourceBadge telemetry={telemetry} />}
      />

      {telemetry.measured ? null : <MonitoringCallout subject="the tenant roster" />}

      <ImpersonationNotice />

      {telemetry.measured ? (
        <TenantsTable tenants={data.platform.tenants} />
      ) : (
        <NotMeasuredPanel
          title="Tenant roster not measured"
          description="This console has no tenant list to show. An empty table here would read as “zero tenants on the platform”, which is not something we know."
        />
      )}
    </div>
  );
}
