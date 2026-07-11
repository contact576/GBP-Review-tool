import { Step } from "../_components/Step";
import { TestInvitePanel } from "./TestInvitePanel";

export default function TestInvitePage() {
  return (
    <Step
      current={6}
      eyebrow="Step 6 of 7"
      title="Send yourself a test invite"
      subtitle="See exactly what your customers get before you send a real one."
      continueHref="/onboarding/team"
      skipHref="/onboarding/team"
    >
      <TestInvitePanel />
    </Step>
  );
}
