import { Step } from "../_components/Step";
import { BusinessTypePicker } from "./BusinessTypePicker";

export default function BusinessTypePage() {
  return (
    <Step
      current={2}
      eyebrow="Step 2 of 7"
      title="What kind of business are you?"
      subtitle="This tailors your review prompts and the attribute catalog customers pick from."
      continueHref="/onboarding/connect"
      skipHref="/onboarding/connect"
    >
      <BusinessTypePicker />
    </Step>
  );
}
