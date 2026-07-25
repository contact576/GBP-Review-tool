"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { QrFrame } from "@/components/app/QrFrame";
import { QrDownload } from "@/components/app/QrDownload";
import { DataChip } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { ProgressMeter } from "@/components/charts";
import { formatNumber } from "@/lib/utils/format";
import { qrOpenRate } from "@/lib/qr/status";

/**
 * Split configurator for the location QR: a pinned live preview pane alongside
 * a scrolling options list (swatch frame theming + real PNG/SVG download).
 *
 * Honesty note: the swatch only re-tints the on-screen preview backing. The
 * scannable code itself is always rendered high-contrast green-on-white by
 * QrFrame so every phone camera reads it — and that's exactly what downloads
 * and prints. QrFrame + QrDownload (real generation/download) are preserved.
 */

type AccentKey = "sage" | "forest" | "amber" | "paper";

const ACCENTS: { key: AccentKey; label: string; dot: string; backing: string }[] = [
  { key: "sage", label: "Sage", dot: "bg-primary", backing: "bg-primary-wash" },
  { key: "forest", label: "Forest", dot: "bg-hero", backing: "bg-hero" },
  { key: "amber", label: "Amber", dot: "bg-gold", backing: "bg-gold-tint" },
  { key: "paper", label: "Paper", dot: "bg-hairline border border-faint/50", backing: "bg-paper" },
];

export function QrConfigurator({
  scanUrl,
  shortUrl,
  title,
  subtitle,
  svgId,
  filename,
  scans,
  pageOpens,
}: {
  scanUrl: string;
  shortUrl: string;
  title: string;
  subtitle: string;
  svgId: string;
  filename: string;
  scans: number;
  pageOpens: number;
}) {
  const [accent, setAccent] = useState<AccentKey>("sage");
  const active = (ACCENTS.find((a) => a.key === accent) ?? ACCENTS[0])!;
  const openRate = qrOpenRate(scans, pageOpens);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Options — scrolls */}
      <div className="order-2 space-y-6 lg:order-1">
        <div>
          <div className="text-[18px] font-bold text-ink">One code, every counter</div>
          <p className="mt-1 text-[14px] text-sub">
            Print it, stand it at reception, and let customers scan straight into your review flow.
            Every scan from a real browser opens a fresh session and counts below.
          </p>
        </div>

        {/* Swatch frame theming */}
        <div>
          <div className="kicker mb-2">Frame accent</div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5" role="radiogroup" aria-label="Frame accent">
              {ACCENTS.map((a) => {
                const selected = a.key === accent;
                return (
                  <button
                    key={a.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${a.label} frame accent`}
                    onClick={() => setAccent(a.key)}
                    className={cn(
                      "grid size-9 place-items-center rounded-full transition-all",
                      selected
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-card"
                        : "ring-1 ring-hairline hover:ring-primary/40",
                    )}
                  >
                    <span className={cn("size-6 rounded-full", a.dot)} />
                  </button>
                );
              })}
            </div>
            <span className="text-[13px] font-semibold text-ink">{active.label}</span>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[12px] text-faint">
            <Icon name="shield" size={13} className="mt-0.5 shrink-0 text-primary" />
            Preview backing only — your code always stays high-contrast green on white so every
            phone camera reads it on the first try.
          </p>
        </div>

        {/* Download — real PNG/SVG export, preserved */}
        <div>
          <div className="kicker mb-2">Download</div>
          <QrDownload svgContainerId={svgId} filename={filename} />
        </div>

        {/* Direct link */}
        <div>
          <div className="kicker mb-2">Direct link</div>
          <DataChip className="break-all">{shortUrl}</DataChip>
        </div>

        {/* This code's performance */}
        <div className="rounded-card border border-hairline p-4">
          <div className="kicker mb-3">This code</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="kicker normal-case">Code scans</div>
              <div className="mt-1 text-[28px] font-extrabold leading-none tabular-nums tracking-tight text-ink">
                {formatNumber(scans)}
              </div>
            </div>
            <div>
              <div className="kicker normal-case">Review pages opened</div>
              <div className="mt-1 text-[28px] font-extrabold leading-none tabular-nums tracking-tight text-ink">
                {formatNumber(pageOpens)}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <ProgressMeter
              value={openRate ?? 0}
              max={100}
              label="Open rate"
              valueText={openRate === null ? "No scans yet" : `${openRate}%`}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Scans count every hit on the short link, including camera previews and link scanners.
            Opens count only the scans a real browser navigated in with and was handed a live
            review page.
          </p>
        </div>
      </div>

      {/* Preview — pinned */}
      <div className="order-1 lg:order-2">
        <div className="lg:sticky lg:top-6">
          <div className={cn("rounded-card p-5 transition-colors duration-250", active.backing)}>
            <QrFrame id={svgId} url={scanUrl} title={title} subtitle={subtitle} shortUrl={shortUrl} />
          </div>
          <p className="sr-only">{`QR code for ${title}. It encodes the review link ${scanUrl}.`}</p>
          <p className="mt-2 text-center text-[11px] text-faint">Live preview</p>
        </div>
      </div>
    </div>
  );
}
