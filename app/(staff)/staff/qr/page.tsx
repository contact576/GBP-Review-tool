import { getData } from "@/lib/data";
import { QrFrame } from "@/components/app/QrFrame";
import { Icon } from "@/components/icons";
import { MICROCOPY } from "@/lib/compliance/microcopy";

export default async function KioskQrPage() {
  const data = await getData();
  const { location } = data;
  const staffQr =
    data.qrAssets.find((q) => q.scope === "staff" && q.staffId === "stf_priya") ??
    data.qrAssets.find((q) => q.scope === "staff");

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-56px)] w-full max-w-[540px] flex-col items-center justify-center gap-6 px-4 pb-28 pt-6 text-center">
      <div>
        <div className="kicker">Kiosk mode</div>
        <p className="mt-1 text-[14px] text-sub">Turn the screen to your customer</p>
      </div>

      <QrFrame
        url={location.reviewUrl}
        title={`Leave ${location.name} a review`}
        subtitle="Point your camera here — about 30 seconds"
      />

      {staffQr ? (
        <div className="w-full max-w-[280px]">
          <div className="mb-2 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-sub">
            <Icon name="qr" size={14} /> Priya&apos;s personal QR
          </div>
          <QrFrame
            url={staffQr.targetUrl}
            title="Scanned with Priya"
            subtitle="Credits the review to Priya's tally"
          />
        </div>
      ) : null}

      <p className="max-w-[280px] text-[11px] text-faint">{MICROCOPY.noIncentive}</p>
    </div>
  );
}
