import { getData } from "@/lib/data";
import { placesEnabled } from "@/lib/google/config";
import { Step } from "../_components/Step";
import { BusinessSearch } from "./BusinessSearch";

export default async function FindBusinessPage() {
  const { location } = await getData();
  const enabled = placesEnabled();

  return (
    <Step
      current={1}
      eyebrow="Step 1 of 7"
      title="Find your business on Google"
      subtitle={
        enabled
          ? "Search your real Google listing — we'll wire review requests and QR codes straight to it."
          : "We'll use the details from your sign-up for now — Google lookup can be connected later."
      }
      continueHref="/onboarding/business-type"
      skipHref="/onboarding/business-type"
    >
      <BusinessSearch
        placesEnabled={enabled}
        current={{
          name: location.name,
          address: location.address,
          city: location.city,
          category: location.category,
          placeId: location.googlePlaceId,
          region: location.region,
        }}
      />
    </Step>
  );
}
