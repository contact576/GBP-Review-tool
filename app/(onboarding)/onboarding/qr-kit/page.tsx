import { getData } from "@/lib/data";
import { appUrl } from "@/lib/utils/app-url";
import { QrFrame } from "@/components/app/QrFrame";
import { buildSetupChecklist } from "../_components/setup-checklist";
import { Step } from "../_components/Step";
import { DownloadPackButton } from "./DownloadPackButton";

export default async function QrKitPage() {
  const data = await getData();
  const { location } = data;
  const base = await appUrl();
  const shortBase = base.replace(/^https?:\/\//, "");
  const checklist = buildSetupChecklist(data);
  // A degraded code is a paused code — it dead-ends on /q-expired, so it is
  // never presented as a printable kit.
  const locationQr = data.qrAssets.find((q) => q.scope === "location" && !q.degraded);

  return (
    <Step
      current={5}
      title={locationQr ? "Your QR kit is ready" : "Your QR kit isn't ready yet"}
      subtitle={
        locationQr
          ? "Print it for the front desk. Each scan starts a fresh review session — no app, no typing."
          : "No active QR code exists for this location yet, so there's nothing to print."
      }
      continueHref="/onboarding/test-invite"
      skipHref="/onboarding/test-invite"
      stepDone={checklist.stepDone}
    >
      <div className="space-y-4">
        {locationQr ? (
          <>
            <QrFrame
              id="qr-svg-onboarding"
              url={`${base}/q/${locationQr.slug}`}
              title={location.name}
              subtitle="Scan to leave a quick review"
              shortUrl={`${shortBase}/q/${locationQr.slug}`}
            />
            <DownloadPackButton
              svgContainerId="qr-svg-onboarding"
              filename={`foundly-qr-${locationQr.slug}`}
            />
          </>
        ) : (
          <p className="py-4 text-center text-[13px] text-faint">
            Your QR code will appear here once your workspace finishes setting up.
          </p>
        )}
      </div>
    </Step>
  );
}
