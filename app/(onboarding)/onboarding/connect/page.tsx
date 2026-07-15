import { getData } from "@/lib/data";
import { googleSignInEnabled } from "@/lib/google/config";
import { Step } from "../_components/Step";
import { ConnectPanel } from "./ConnectPanel";

export default async function ConnectPage() {
  const data = await getData();
  const google = data.integrations?.find((i) => i.provider === "google") ?? null;

  return (
    <Step
      current={3}
      eyebrow="Step 3 of 7"
      title="Connect Google Business Profile"
      subtitle="Foundly reads what's public and publishes only edits you approve."
      continueHref="/onboarding/channels"
      skipHref="/onboarding/channels"
    >
      <ConnectPanel
        integration={google ? { status: google.status, detail: google.detail } : null}
        googleEnabled={googleSignInEnabled()}
      />
    </Step>
  );
}
