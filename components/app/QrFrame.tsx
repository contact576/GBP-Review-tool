"use client";

import { QRCodeSVG } from "qrcode.react";
import { DataChip } from "@/components/ds/misc";
import { Wordmark } from "./AppShell";

/**
 * Branded QR frame for the printable capture kit.
 * - `shortUrl` renders a human-readable fallback line under the code for
 *   people who can't (or won't) scan.
 * - `id` is applied to the QR's white wrapper so download tooling
 *   (components/app/QrDownload) can locate the inner <svg>.
 */
export function QrFrame({
  url, title, subtitle, agencyBrand, shortUrl, id,
}: {
  url: string;
  title: string;
  subtitle?: string;
  agencyBrand?: string;
  shortUrl?: string;
  id?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[280px] rounded-card border border-hairline bg-card p-6 text-center shadow-sm">
      <div className="mb-3 text-[15px] font-bold text-ink">{title}</div>
      <div id={id} className="mx-auto inline-block rounded-card bg-white p-3 ring-1 ring-hairline">
        <QRCodeSVG value={url} size={168} level="M" fgColor="#0C4A3E" bgColor="#FFFFFF" />
      </div>
      <p className="mt-3 text-[13px] text-sub">{subtitle ?? "Scan to leave us a quick review"}</p>
      {shortUrl ? (
        <p className="mt-2 text-[11px] text-faint">
          or visit: <DataChip className="break-all text-left text-[11px]">{shortUrl}</DataChip>
        </p>
      ) : null}
      <div className="mt-4 flex items-center justify-center border-t border-hairline pt-3 text-[11px] text-faint">
        {agencyBrand ? <span className="font-semibold">{agencyBrand}</span> : <Wordmark small />}
      </div>
    </div>
  );
}
