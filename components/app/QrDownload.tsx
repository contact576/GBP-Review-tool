"use client";

import { useState } from "react";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";

/**
 * Real PNG/SVG downloads for a rendered QR code.
 * Finds the <svg> inside the element with id `svgContainerId` (pass the same
 * id to <QrFrame id=…>), serialises it, and downloads it either as-is (SVG)
 * or rasterised onto a canvas (PNG, `size` px square — default 1024).
 */
export function QrDownload({
  svgContainerId,
  filename,
  size = 1024,
}: {
  svgContainerId: string;
  filename: string;
  size?: number;
}) {
  const { toast } = useToast();
  const [pngBusy, setPngBusy] = useState(false);

  function serializeSvg(): string | null {
    const container = document.getElementById(svgContainerId);
    const svg = container?.querySelector("svg");
    if (!svg) return null;
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    return new XMLSerializer().serializeToString(clone);
  }

  function triggerDownload(href: string, name: string) {
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadSvg() {
    const markup = serializeSvg();
    if (!markup) {
      toast("Couldn't find the QR code on this page", "warning", "alert");
      return;
    }
    const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, `${filename}.svg`);
    URL.revokeObjectURL(objectUrl);
    toast("SVG downloaded — crisp at any print size", "success", "download");
  }

  function downloadPng() {
    const markup = serializeSvg();
    if (!markup) {
      toast("Couldn't find the QR code on this page", "warning", "alert");
      return;
    }
    setPngBusy(true);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable");
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        triggerDownload(canvas.toDataURL("image/png"), `${filename}.png`);
        toast("PNG downloaded", "success", "download");
      } catch {
        toast("PNG export failed — try the SVG instead", "warning", "alert");
      } finally {
        setPngBusy(false);
      }
    };
    img.onerror = () => {
      setPngBusy(false);
      toast("PNG export failed — try the SVG instead", "warning", "alert");
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="secondary"
        size="md"
        icon="download"
        loading={pngBusy}
        onClick={downloadPng}
        aria-label={`Download ${filename} as a PNG image`}
      >
        PNG
      </Button>
      <Button
        variant="secondary"
        size="md"
        icon="download"
        onClick={downloadSvg}
        aria-label={`Download ${filename} as an SVG file`}
      >
        SVG
      </Button>
    </div>
  );
}
