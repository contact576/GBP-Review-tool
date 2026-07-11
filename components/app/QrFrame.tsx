"use client";

import { QRCodeSVG } from "qrcode.react";
import { Wordmark } from "./AppShell";

/** Branded QR frame for the printable capture kit. */
export function QrFrame({
  url, title, subtitle, agencyBrand,
}: {
  url: string; title: string; subtitle?: string; agencyBrand?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[280px] rounded-card border border-hairline bg-card p-6 text-center shadow-sm">
      <div className="mb-3 text-[15px] font-bold text-ink">{title}</div>
      <div className="mx-auto inline-block rounded-card bg-white p-3 ring-1 ring-hairline">
        <QRCodeSVG value={url} size={168} level="M" fgColor="#0C4A3E" bgColor="#FFFFFF" />
      </div>
      <p className="mt-3 text-[13px] text-sub">{subtitle ?? "Scan to leave us a quick review"}</p>
      <div className="mt-4 flex items-center justify-center border-t border-hairline pt-3 text-[11px] text-faint">
        {agencyBrand ? <span className="font-semibold">{agencyBrand}</span> : <Wordmark small />}
      </div>
    </div>
  );
}
