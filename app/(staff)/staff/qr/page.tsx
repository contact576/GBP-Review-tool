import { appUrl } from "@/lib/utils/app-url";
import { QrFrame } from "@/components/app/QrFrame";
import { Icon } from "@/components/icons";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { getStaffIdentity } from "../../staff-identity";

export default async function KioskQrPage() {
  // The personal code belongs to whoever is signed in — never a fallback to
  // "some staff QR", which would credit their scans to a teammate.
  const { data, staff: me, unlinkedReason, displayName, canManageTeam } = await getStaffIdentity();
  const { location } = data;
  const base = await appUrl();
  const shortBase = base.replace(/^https?:\/\//, "");

  const locationQr = data.qrAssets.find((q) => q.scope === "location");
  const staffQr = me
    ? data.qrAssets.find((q) => q.scope === "staff" && q.staffId === me.id)
    : undefined;
  const myFirstName = (me?.displayName ?? displayName).split(/\s+/)[0] ?? displayName;

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

      {me && staffQr ? (
        <div className="w-full max-w-[280px]">
          <div className="mb-2 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-sub">
            <Icon name="qr" size={14} /> {myFirstName}&apos;s personal QR
          </div>
          <QrFrame
            url={`${base}/q/${staffQr.slug}`}
            title={`Scanned with ${myFirstName}`}
            subtitle={`Credits the review to ${myFirstName}'s tally`}
            shortUrl={`${shortBase}/q/${staffQr.slug}`}
          />
        </div>
      ) : me ? (
        <div className="max-w-[300px] rounded-card border border-hairline bg-card p-4 text-[13px] leading-relaxed text-sub shadow-sm">
          <span className="mb-2 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-ink">
            <Icon name="qr" size={14} /> No personal QR yet
          </span>
          {myFirstName}, the location code above still works — it just won&apos;t credit the review
          to you. Ask the owner to generate your personal code in the studio.
        </div>
      ) : (
        <div className="max-w-[300px] rounded-card border border-hairline bg-card p-4 text-[13px] leading-relaxed text-sub shadow-sm">
          <span className="mb-2 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-ink">
            <Icon name="users" size={14} /> No personal QR for this account
          </span>
          {unlinkedReason === "ambiguous"
            ? "More than one teammate shares your name, so there's no personal code we can safely hand you."
            : "You're not on the front-desk roster, so there's no personal code to credit scans to."}{" "}
          {canManageTeam
            ? "Add yourself under Settings → Team to get one."
            : "Ask the owner or a manager to add you under Settings → Team."}
        </div>
      )}

      <p className="max-w-[280px] text-[11px] text-faint">{MICROCOPY.noIncentive}</p>
    </div>
  );
}
