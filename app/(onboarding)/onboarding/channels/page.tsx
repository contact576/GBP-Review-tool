import { Step } from "../_components/Step";
import { ChannelsPanel } from "./ChannelsPanel";

export default function ChannelsPage() {
  return (
    <Step
      current={4}
      eyebrow="Step 4 of 7"
      title="How should invites go out?"
      subtitle="Start with email today. Add SMS once carriers approve your number."
      continueHref="/onboarding/qr-kit"
      skipHref="/onboarding/qr-kit"
    >
      <ChannelsPanel />
    </Step>
  );
}
