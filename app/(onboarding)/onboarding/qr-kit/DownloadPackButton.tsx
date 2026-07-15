import { QrDownload } from "@/components/app/QrDownload";

/**
 * Real downloads of the onboarding QR shown above (see QrFrame's `id` prop):
 * PNG for docs and email signatures, SVG for print-quality signage.
 */
export function DownloadPackButton({
  svgContainerId,
  filename,
}: {
  svgContainerId: string;
  filename: string;
}) {
  return (
    <div className="space-y-2">
      <QrDownload svgContainerId={svgContainerId} filename={filename} />
      <p className="text-center text-[12px] text-faint">
        PNG for email signatures and docs — SVG stays crisp at any print size.
      </p>
    </div>
  );
}
