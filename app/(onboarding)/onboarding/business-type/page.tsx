import { getData } from "@/lib/data";
import { buildSetupChecklist } from "../_components/setup-checklist";
import { Step } from "../_components/Step";
import { BusinessTypePicker } from "./BusinessTypePicker";

export default async function BusinessTypePage() {
  const data = await getData();
  const checklist = buildSetupChecklist(data);

  return (
    <Step
      current={2}
      title="What kind of business are you?"
      subtitle="This tailors your review prompts and the attribute catalog customers pick from."
      continueHref="/onboarding/connect"
      skipHref="/onboarding/connect"
      stepDone={checklist.stepDone}
    >
      <BusinessTypePicker initial={data.workspace.vertical} />
    </Step>
  );
}
