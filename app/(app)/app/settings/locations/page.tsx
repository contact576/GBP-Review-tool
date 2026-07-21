import { getProviderFor, getSessionAndData } from "@/lib/data";
import { INDUSTRIES } from "@/lib/industries";
import { PLANS } from "@/lib/billing/plans";
import { SettingsShell } from "../SettingsShell";
import { LocationsManager } from "./LocationsManager";

export default async function LocationsSettingsPage() {
  const { data, session } = await getSessionAndData();
  const provider = await getProviderFor(session);
  const locations = await provider.listOrganizationWorkspaces(session.workspaceId);
  const plan = PLANS[data.subscription.tier];
  return (
    <SettingsShell
      title="Locations"
      sub="One organization, cleanly isolated location workspaces, and a fast switcher in the dashboard header."
    >
      <LocationsManager
        locations={locations}
        currentWorkspaceId={session.workspaceId}
        industries={INDUSTRIES.map(({ key, label }) => ({ key, label }))}
        limit={plan.limits.locations}
      />
    </SettingsShell>
  );
}
