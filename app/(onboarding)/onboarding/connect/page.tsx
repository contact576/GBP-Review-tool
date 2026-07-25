import { getData } from "@/lib/data";
import { googleSignInEnabled } from "@/lib/google/config";
import { buildSetupChecklist } from "../_components/setup-checklist";
import { Step } from "../_components/Step";
import { ConnectPanel } from "./ConnectPanel";

export default async function ConnectPage() {
  const data = await getData();
  const google = data.integrations?.find((i) => i.provider === "google") ?? null;
  const checklist = buildSetupChecklist(data);

  return (
    <Step
      current={3}
      title="Connect Google Business Profile"
      subtitle="Foundly reads your profile and prepares improvements for you to review and apply."
      continueHref="/onboarding/channels"
      skipHref="/onboarding/channels"
      stepDone={checklist.stepDone}
    >
      <ConnectPanel
        integration={google ? { status: google.status, detail: google.detail } : null}
        googleEnabled={googleSignInEnabled()}
      />
    </Step>
  );
}
