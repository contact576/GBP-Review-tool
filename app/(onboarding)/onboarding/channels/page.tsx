import { getData } from "@/lib/data";
import { emailEnabled } from "@/lib/email";
import { smsEnabled } from "@/lib/sms/twilio";
import { buildSetupChecklist } from "../_components/setup-checklist";
import { Step } from "../_components/Step";
import { ChannelsPanel } from "./ChannelsPanel";

export default async function ChannelsPage() {
  const data = await getData();
  const integrations = data.integrations ?? [];
  const resend = integrations.find((i) => i.provider === "resend");
  const twilio = integrations.find((i) => i.provider === "twilio");
  const checklist = buildSetupChecklist(data);

  // A channel counts as live only when it can genuinely send: the workspace's
  // integration row says connected, or the platform adapter is configured.
  const email = {
    live: resend?.status === "connected" || emailEnabled(),
    status: resend?.status,
    detail: resend?.detail,
  };
  const sms = {
    live: twilio?.status === "connected" || smsEnabled(),
    status: twilio?.status,
    detail: twilio?.detail,
  };

  return (
    <Step
      current={4}
      title="How should invites go out?"
      subtitle={
        email.live
          ? "Email is your default channel. Add SMS once carriers approve your number."
          : "Here's the real state of each channel — nothing shows as on until it can actually send."
      }
      continueHref="/onboarding/qr-kit"
      skipHref="/onboarding/qr-kit"
      stepDone={checklist.stepDone}
    >
      <ChannelsPanel email={email} sms={sms} />
    </Step>
  );
}
