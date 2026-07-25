import { getData } from "@/lib/data";
import { placesEnabled } from "@/lib/google/config";
import { buildSetupChecklist } from "../_components/setup-checklist";
import { Step } from "../_components/Step";
import { BusinessSearch } from "./BusinessSearch";

export default async function FindBusinessPage() {
  const data = await getData();
  const { location } = data;
  const enabled = placesEnabled();
  const checklist = buildSetupChecklist(data);

  return (
    <Step
      current={1}
      title="Find your business on Google"
      subtitle={
        enabled
          ? "Search your real Google listing — we'll wire review requests and QR codes straight to it."
          : "We'll use the details from your sign-up for now — Google lookup can be connected later."
      }
      continueHref="/onboarding/business-type"
      skipHref="/onboarding/business-type"
      stepDone={checklist.stepDone}
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
