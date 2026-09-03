import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getProviderFor, getSessionAndData } from "@/lib/data";
import { AppShell } from "@/components/app/AppShell";
import { DemoBanner } from "@/components/app/DemoBanner";
import { AgencyActingBanner } from "@/components/app/AgencyActingBanner";
import { shouldTrialLock, trialLockAllowsPath, trialState } from "@/lib/billing/trial";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, data } = await getSessionAndData();

  // ── Expired-trial lock ────────────────────────────────────
  // Nothing ever flips a `trialing` row after day 30, so the lock is enforced
  // at read time: an owner whose trial has run out is sent to the page that
  // explains it, and can still reach billing (to pay), settings, and their
  // customers (to leave with their data). Acting agency/platform admins, the
  // demo, and agency-tier workspaces are never locked (lib/billing/trial.ts).
  // This covers full-page loads; AppShell repeats the check on client-side
  // navigation, since a shared layout does not re-render between pages.
  const trial = trialState(data.subscription);
  const locked = shouldTrialLock(
    { role: session.role, acting: Boolean(session.homeWorkspaceId), isDemo: session.isDemo },
    data.subscription,
  );
  if (locked) {
    // Forwarded by middleware. Absent (middleware skipped) → fail open rather
    // than loop: redirecting without knowing the path could redirect forever.
    const pathname = (await headers()).get("x-pathname");
    if (pathname && !trialLockAllowsPath(pathname)) redirect("/app/trial-ending");
  }

  const trialLeft = trial.phase === "trialing" || trial.phase === "ending_soon" ? trial.daysLeft : undefined;
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
  // An agency admin can also open the agency's OWN workspace (its listing);
  // the banner then says so instead of "Managing X as X".
  const actingMode =
    session.role === "platform_admin"
      ? "support"
      : session.homeWorkspaceId === session.workspaceId
        ? "self"
        : "agency";

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
        trialEnded={trial.phase === "expired"}
        trialLocked={locked}
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
