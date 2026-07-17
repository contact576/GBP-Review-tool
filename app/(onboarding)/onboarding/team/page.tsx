import { getData } from "@/lib/data";
import { Step } from "../_components/Step";
import { TeamInvitePanel } from "./TeamInvitePanel";

export default async function TeamPage() {
  const data = await getData();
  const pendingInvites = data.invites.filter((i) => i.status === "pending");

  return (
    <Step
      current={7}
      title="Invite your team"
      subtitle="Each teammate gets their own QR code and lands on your staff leaderboard."
      continueHref="/onboarding/finish"
      skipHref="/onboarding/finish"
    >
      <TeamInvitePanel invites={pendingInvites} staff={data.staff} />
    </Step>
  );
}
