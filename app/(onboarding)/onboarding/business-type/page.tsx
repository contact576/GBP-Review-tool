import { getData } from "@/lib/data";
import { Step } from "../_components/Step";
import { BusinessTypePicker } from "./BusinessTypePicker";

export default async function BusinessTypePage() {
  const data = await getData();

  return (
    <Step
      current={2}
      title="What kind of business are you?"
      subtitle="This tailors your review prompts and the attribute catalog customers pick from."
      continueHref="/onboarding/connect"
      skipHref="/onboarding/connect"
    >
      <BusinessTypePicker initial={data.workspace.vertical} />
    </Step>
  );
}
