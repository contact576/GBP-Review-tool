import { Step } from "../_components/Step";
import { TeamInvitePanel } from "./TeamInvitePanel";

export default function TeamPage() {
  return (
    <Step
      current={7}
      eyebrow="Step 7 of 7"
      title="Invite your team"
      subtitle="Each teammate gets their own QR code and lands on your staff leaderboard."
      continueHref="/onboarding/finish"
      skipHref="/onboarding/finish"
    >
      <TeamInvitePanel />
    </Step>
  );
}
