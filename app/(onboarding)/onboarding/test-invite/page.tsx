import { redirect } from "next/navigation";
import { getData } from "@/lib/data";
import { captureCustomerAction } from "@/lib/actions";
import { Step } from "../_components/Step";
import { TestInvitePanel } from "./TestInvitePanel";

export default function TestInvitePage() {
  async function previewReviewPage() {
    "use server";
    const data = await getData();
    const { token } = await captureCustomerAction({
      locationId: data.location.id,
      name: "Test invite",
      email: data.owner.email,
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
    >
      <TestInvitePanel action={previewReviewPage} />
    </Step>
  );
}
