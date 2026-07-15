import { getSessionAndData } from "@/lib/data";
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

  return (
    <>
      {session.isDemo ? <DemoBanner /> : null}
      <AppShell
        business={data.location.name}
        ownerName={data.owner.name}
        trialDaysLeft={trialLeft}
        unread={unread}
      >
        {children}
      </AppShell>
    </>
  );
}
