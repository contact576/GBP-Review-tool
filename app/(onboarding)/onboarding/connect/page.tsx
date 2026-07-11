import { Step } from "../_components/Step";
import { ConnectPanel } from "./ConnectPanel";

export default function ConnectPage() {
  return (
    <Step
      current={3}
      eyebrow="Step 3 of 7"
      title="Connect Google Business Profile"
      subtitle="Foundly reads what's public and publishes only edits you approve."
      continueHref="/onboarding/channels"
      skipHref="/onboarding/channels"
    >
      <ConnectPanel />
    </Step>
  );
}
