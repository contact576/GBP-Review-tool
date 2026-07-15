import { getData } from "@/lib/data";
import { appUrl } from "@/lib/utils/app-url";
import { QrFrame } from "@/components/app/QrFrame";
import { Icon } from "@/components/icons";
import { MICROCOPY } from "@/lib/compliance/microcopy";

export default async function KioskQrPage() {
  const data = await getData();
  const { location } = data;
  const base = await appUrl();
  const shortBase = base.replace(/^https?:\/\//, "");

  const locationQr = data.qrAssets.find((q) => q.scope === "location");
  const staffQr =
    data.qrAssets.find((q) => q.scope === "staff" && q.staffId === "stf_priya") ??
    data.qrAssets.find((q) => q.scope === "staff");
  const staffMember = staffQr?.staffId
    ? data.staff.find((s) => s.id === staffQr.staffId)
    : undefined;
  const staffFirst = staffMember?.displayName.split(/\s+/)[0] ?? "your teammate";

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-56px)] w-full max-w-[540px] flex-col items-center justify-center gap-6 px-4 pb-28 pt-6 text-center">
      <div>
        <div className="kicker">Kiosk mode</div>
        <p className="mt-1 text-[14px] text-sub">Turn the screen to your customer</p>
      </div>

      {locationQr ? (
        <div className="w-full">
          <QrFrame
            url={`${base}/q/${locationQr.slug}`}
            title={`Leave ${location.name} a review`}
            subtitle="Point your camera here — about 30 seconds"
            shortUrl={`${shortBase}/q/${locationQr.slug}`}
          />
          <p className="mt-2 text-[11px] text-faint">Each scan starts a fresh review session.</p>
        </div>
      ) : (
        <p className="max-w-[280px] text-[13px] text-faint">
          No location QR is configured yet — ask the owner to finish setup in the studio.
        </p>
      )}

      {staffQr ? (
        <div className="w-full max-w-[280px]">
          <div className="mb-2 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-sub">
            <Icon name="qr" size={14} /> {staffFirst}&apos;s personal QR
          </div>
          <QrFrame
            url={`${base}/q/${staffQr.slug}`}
            title={`Scanned with ${staffFirst}`}
            subtitle={`Credits the review to ${staffFirst}'s tally`}
            shortUrl={`${shortBase}/q/${staffQr.slug}`}
          />
        </div>
      ) : null}

      <p className="max-w-[280px] text-[11px] text-faint">{MICROCOPY.noIncentive}</p>
    </div>
  );
}
