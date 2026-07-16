import type { Metadata } from "next";
import { Icon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Review code not active",
  robots: { index: false },
};

/** Calm landing for scans of unknown, paused, or degraded QR codes. */
export default function QrExpiredPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16 text-center animate-fade-in">
      <div className="grid size-16 place-items-center rounded-card bg-primary-wash text-primary">
        <Icon name="qr" size={30} />
      </div>
      <h1 className="mt-5 text-[22px] font-extrabold leading-tight text-ink">
        This review code isn&apos;t active.
      </h1>
      <p className="mt-2 max-w-[300px] text-[14px] leading-relaxed text-sub">
        The business may have paused or replaced this code. Nothing is needed from you — you can
        simply close this page.
      </p>
    </div>
  );
}
