import { getData } from "@/lib/data";
import type { Vertical } from "@/lib/data/types";
import { CaptureForm } from "./CaptureForm";

/** Vertical-seeded quick-pick attributes (colocated — do not depend on other route groups). */
const ATTRS: Record<Vertical, string[]> = {
  physiotherapy: ["Friendly staff", "Got results", "Easy booking", "On time", "Clear explanations", "Direct billing"],
  chiropractic: ["Pain relief", "Gentle care", "Friendly staff", "On time", "Clear plan", "Easy booking"],
  dental: ["Painless visit", "Gentle staff", "Clean clinic", "On time", "Explained everything", "Fair pricing"],
  hvac: ["On time", "Fair pricing", "Fixed it fast", "Tidy work", "Friendly tech", "Explained the issue"],
  renovation: ["Quality work", "On schedule", "Great communication", "Tidy site", "Fair pricing", "Would rehire"],
  salon: ["Loved the result", "Friendly stylist", "Relaxing", "On time", "Great value", "Easy booking"],
  restaurant: ["Great food", "Friendly service", "Fast service", "Great value", "Cozy vibe", "Would return"],
};

export default async function StaffCapturePage() {
  const data = await getData();
  const seeds = ATTRS[data.location.vertical] ?? ATTRS.physiotherapy;

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
