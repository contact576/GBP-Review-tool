import { redirect } from "next/navigation";
import { getData } from "@/lib/data";
import { emailEnabled } from "@/lib/email";
import { captureCustomerAction } from "@/lib/actions";
import { buildSetupChecklist } from "../_components/setup-checklist";
import { Step } from "../_components/Step";
import { TestInvitePanel } from "./TestInvitePanel";

export default async function TestInvitePage() {
  const data = await getData();
  const checklist = buildSetupChecklist(data);
  const resend = (data.integrations ?? []).find((i) => i.provider === "resend");
  const emailLive = resend?.status === "connected" || emailEnabled();
  const existingRequests = data.requests.length;

  async function previewReviewPage() {
    "use server";
    const current = await getData();
    const { token } = await captureCustomerAction({
      locationId: current.location.id,
      name: "Test invite",
      email: current.owner.email,
      channel: "email",
      services: [],
      serviceConsent: true,
      marketingConsent: false,
      consentSourceText: "Owner test invite",
    });
    redirect(`/r/${token}`);
  }

  return (
    <Step
      current={6}
      title="Try your review page"
      subtitle="See exactly what your customers get before you send a real invite."
      continueHref="/onboarding/team"
      skipHref="/onboarding/team"
      stepDone={checklist.stepDone}
    >
      <TestInvitePanel
        action={previewReviewPage}
        emailLive={emailLive}
        existingRequests={existingRequests}
      />
    </Step>
  );
}
