import { getData } from "@/lib/data";
import { buildSetupChecklist } from "../_components/setup-checklist";
import { Step } from "../_components/Step";
import { WebsitePanel } from "./WebsitePanel";

export default async function WebsitePage() {
  const data = await getData();
  const { location } = data;
  const checklist = buildSetupChecklist(data);
  const googleUrl = location.gbpSnapshot?.location.websiteUri ?? null;
  const scanned = location.websiteEvidence?.status === "synced";

  return (
    <Step
      current={2}
      title={scanned ? "Your website is connected" : "Connect your website"}
      subtitle={
        scanned
          ? "We read your services from it. Rescan any time your site changes."
          : "We read the services you list so customers can say what they came in for, and so review wording fits your work."
      }
      continueHref="/onboarding/business-type"
      skipHref="/onboarding/business-type"
      skipLabel="No website yet — skip"
      stepDone={checklist.stepDone}
    >
      <WebsitePanel
        initialUrl={location.website ?? ""}
        googleUrl={googleUrl}
        existing={location.websiteEvidence ?? null}
        initialExcluded={data.workspace.industryConfig?.excludedServices ?? []}
      />
    </Step>
  );
}
