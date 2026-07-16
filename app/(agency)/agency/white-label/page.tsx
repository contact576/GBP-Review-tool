import { getData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
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
      <PageHeader
        title="White-label"
        sub="Theme the portal and every client-facing report. The preview updates live as you type."
      />

      <WhiteLabelStudio
        initial={{
          brandName: wl.brandName,
          primary: wl.primary,
          primaryDark: wl.primaryDark,
          accent: wl.accent,
          logoText: wl.logoText,
          domain: wl.domain,
        }}
        sample={sample}
      />
    </div>
  );
}
