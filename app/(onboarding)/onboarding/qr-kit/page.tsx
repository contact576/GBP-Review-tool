import { getData } from "@/lib/data";
import { appUrl } from "@/lib/utils/app-url";
import { QrFrame } from "@/components/app/QrFrame";
import { Step } from "../_components/Step";
import { DownloadPackButton } from "./DownloadPackButton";

export default async function QrKitPage() {
  const data = await getData();
  const { location } = data;
  const base = await appUrl();
  const shortBase = base.replace(/^https?:\/\//, "");
  const locationQr =
    data.qrAssets.find((q) => q.scope === "location") ?? data.qrAssets[0];

  return (
    <Step
      current={5}
      eyebrow="Step 5 of 7"
      title="Your QR kit is ready"
      subtitle="Print it for the front desk. Each scan starts a fresh review session — no app, no typing."
      continueHref="/onboarding/test-invite"
      skipHref="/onboarding/test-invite"
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
