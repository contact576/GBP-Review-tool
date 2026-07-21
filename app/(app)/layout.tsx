import { getProviderFor, getSessionAndData } from "@/lib/data";
import { AppShell } from "@/components/app/AppShell";
import { DemoBanner } from "@/components/app/DemoBanner";
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

  return (
    <>
      {session.isDemo ? <DemoBanner /> : null}
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
      >
        {children}
      </AppShell>
    </>
  );
}
