import { getData } from "@/lib/data";
import { WhiteLabelStudio, type SampleClient } from "./WhiteLabelStudio";

export default async function WhiteLabelPage() {
  const data = await getData();
  const wl = data.agency.whiteLabel;
  const first = data.agency.clients[0];

  const sample: SampleClient = first
    ? {
        name: first.name,
        city: first.city,
        growthScore: first.growthScore,
        rating: first.rating,
        newReviews30d: first.newReviews30d,
      }
    : { name: "Harbourview Physiotherapy", city: "Toronto", growthScore: 78, rating: 4.7, newReviews30d: 9 };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">White-label studio</h1>
        <p className="text-[14px] text-sub">Theme the portal and every client-facing report. The preview updates live as you type.</p>
      </div>

      <WhiteLabelStudio
        initial={{ brandName: wl.brandName, primary: wl.primary, accent: wl.accent, logoText: wl.logoText }}
        sample={sample}
      />
    </div>
  );
}
