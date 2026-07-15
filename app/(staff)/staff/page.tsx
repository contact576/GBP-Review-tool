import { getData } from "@/lib/data";
import { resolveWorkspaceIndustry } from "@/lib/industries";
import { CaptureForm } from "./CaptureForm";

export default async function StaffCapturePage() {
  const data = await getData();
  // Quick-pick attributes come from the 36-industry catalog (plus any
  // workspace-level custom attributes), same source as the customer flow.
  const industry = resolveWorkspaceIndustry(
    data.location.vertical,
    data.workspace.industryConfig
      ? {
          label: data.workspace.industryConfig.customLabel,
          services: data.workspace.industryConfig.customServices,
          attributes: data.workspace.industryConfig.customAttributes,
        }
      : undefined,
  );
  const seeds = industry.attributes.slice(0, 8);

  // "Priya" is the demo front-desk operator. Compute her rank for the stats row.
  const sorted = [...data.staff].sort((a, b) => b.captures - a.captures);
  const priya = data.staff.find((s) => s.id === "stf_priya") ?? sorted[0];
  const rank = priya ? sorted.findIndex((s) => s.id === priya.id) + 1 : 0;

  return (
    <CaptureForm
      locationId={data.location.id}
      region={data.location.region}
      staffId={priya?.id ?? "stf_priya"}
      attributeSeeds={seeds}
      rank={rank}
      totalStaff={data.staff.length}
    />
  );
}
