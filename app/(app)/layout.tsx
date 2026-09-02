import { getProviderFor, getSessionAndData } from "@/lib/data";
import { AppShell } from "@/components/app/AppShell";
import { DemoBanner } from "@/components/app/DemoBanner";
import { AgencyActingBanner } from "@/components/app/AgencyActingBanner";
import { daysUntil } from "@/lib/utils/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, data } = await getSessionAndData();
  const trialLeft =
    data.subscription.status === "trialing" && data.subscription.trialEndsAt
      ? daysUntil(data.subscription.trialEndsAt)
      : undefined;
  const unread = data.notifications.filter((n) => !n.read).length;
  const provider = await getProviderFor(session);
  const locations = await provider.listOrganizationWorkspaces(session.workspaceId);
  // An agency admin inside a client workspace: name the agency they act for.
  // A platform admin inside a tenant: name the support session honestly.
  const agencyHome =
    session.role === "agency_admin" && session.homeWorkspaceId
      ? await provider.getData(session.homeWorkspaceId)
      : null;
  const actingFor = agencyHome
    ? agencyHome.agency.whiteLabel.brandName
    : session.role === "platform_admin" && session.homeWorkspaceId
      ? "Foundly support"
      : null;
  const actingMode = session.role === "platform_admin" ? "support" : "agency";

  return (
    <>
      {session.isDemo ? <DemoBanner /> : null}
      {actingFor ? (
        <AgencyActingBanner client={data.location.name} brandName={actingFor} mode={actingMode} />
      ) : null}
      <AppShell
        business={data.location.name}
        ownerName={data.owner.name}
        ownerEmail={data.owner.email}
        trialDaysLeft={trialLeft}
        unread={unread}
        locations={locations}
        currentWorkspaceId={session.workspaceId}
        agencyMode={data.subscription.tier === "agency"}
        isDemo={session.isDemo}
        hasBanner={session.isDemo || Boolean(actingFor)}
      >
        {children}
      </AppShell>
    </>
  );
}
