import { getData } from "@/lib/data";
import { buildSetupChecklist } from "../_components/setup-checklist";
import { Step } from "../_components/Step";
import { TeamInvitePanel } from "./TeamInvitePanel";

export default async function TeamPage() {
  const data = await getData();
  const pendingInvites = data.invites.filter((i) => i.status === "pending");
  const checklist = buildSetupChecklist(data);

  return (
    <Step
      current={7}
      title="Invite your team"
      subtitle="Each teammate gets their own QR code and lands on your staff leaderboard."
      continueHref="/onboarding/finish"
      skipHref="/onboarding/finish"
      stepDone={checklist.stepDone}
    >
      <TeamInvitePanel invites={pendingInvites} staff={data.staff} />
    </Step>
  );
}
