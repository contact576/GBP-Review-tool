import { getPlatformSnapshot, getSessionAndData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import {
  MonitoringCallout,
  NotMeasuredPanel,
  TelemetrySourceBadge,
  readPlatformTelemetry,
} from "../../_components/telemetry";
import { ImpersonationNotice, TenantsTable } from "./TenantsTable";

export default async function AdminTenantsPage() {
  const [{ session }, platform] = await Promise.all([getSessionAndData(), getPlatformSnapshot()]);
  const telemetry = readPlatformTelemetry(platform, session.isDemo);

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
      {platform.testAccountsExcluded ? (
        <p className="text-[12px] text-faint">
          {platform.testAccountsExcluded} automated test account{platform.testAccountsExcluded === 1 ? "" : "s"} (reserved
          test domains) left out of this roster and every figure on the console.
        </p>
      ) : null}

      <ImpersonationNotice />

      {telemetry.measured ? (
        <TenantsTable tenants={platform.tenants} canOpen={!session.isDemo} />
      ) : (
        <NotMeasuredPanel
          title="Tenant roster not measured"
          description="This console has no tenant list to show. An empty table here would read as “zero tenants on the platform”, which is not something we know."
        />
      )}
    </div>
  );
}
