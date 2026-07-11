import { getData } from "@/lib/data";
import { QrFrame } from "@/components/app/QrFrame";
import { Step } from "../_components/Step";
import { DownloadPackButton } from "./DownloadPackButton";

export default async function QrKitPage() {
  const { location } = await getData();

  return (
    <Step
      current={5}
      eyebrow="Step 5 of 7"
      title="Your QR kit is ready"
      subtitle="Print it for the front desk. Every scan opens your review page — no app, no typing."
      continueHref="/onboarding/test-invite"
      skipHref="/onboarding/test-invite"
    >
      <div className="space-y-4">
        <QrFrame url={location.reviewUrl} title={location.name} subtitle="Scan to leave a quick review" />
        <DownloadPackButton />
      </div>
    </Step>
  );
}
