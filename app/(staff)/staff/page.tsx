import { resolveWorkspaceIndustry } from "@/lib/industries";
import { getStaffIdentity } from "../staff-identity";
import { RosterNotice } from "../RosterNotice";
import { CaptureForm } from "./CaptureForm";

export default async function StaffCapturePage() {
  // The signed-in account, resolved against the workspace's real roster —
  // never a hardcoded demo id.
  const { data, staff, unlinkedReason, roster, rank, displayName, canManageTeam } =
    await getStaffIdentity();

  // Quick-pick attributes come from the 36-industry catalog (plus any
  // workspace-level custom attributes), same source as the customer flow.
  const industry = resolveWorkspaceIndustry(
    data.location.vertical,
    data.workspace.industryConfig,
  );
  const seeds = industry.attributes.slice(0, 8);

  return (
    <CaptureForm
      locationId={data.location.id}
      region={data.location.region}
      // Undefined when nothing links this account to a roster row: the capture
      // is still saved to the business, but it credits nobody rather than
      // silently crediting a stranger.
      staffId={staff?.id}
      attributeSeeds={seeds}
      rank={rank}
      totalStaff={roster.length}
      notice={
        unlinkedReason ? (
          <RosterNotice
            reason={unlinkedReason}
            name={displayName}
            canManageTeam={canManageTeam}
            compact
          />
        ) : null
      }
    />
  );
}
