"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import { milestoneHeadline, milestoneSlug } from "@/lib/milestone-share";
import type { Milestone } from "@/lib/data/types";

// ── Foundly brand tokens (mirrored for canvas — canvas can't read CSS vars) ──
const HERO = "#0C4A3E"; // deep-green hero background
const HERO_DEEP = "#0A3D33";
const GOLD = "#E8A33D";
const WHITE = "#FFFFFF";
const SIZE = 1080; // square social export (px)
const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Draw a 4-point sparkle with concave sides, filled `color`. */
function drawSpark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  const inner = r * 0.28;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + inner, cy - inner, cx + r, cy);
  ctx.quadraticCurveTo(cx + inner, cy + inner, cx, cy + r);
  ctx.quadraticCurveTo(cx - inner, cy + inner, cx - r, cy);
  ctx.quadraticCurveTo(cx - inner, cy - inner, cx, cy - r);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Draw a 5-point star, filled `color`. */
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, color: string) {
  const spikes = 5;
  const inner = R * 0.42;
  const step = Math.PI / spikes;
  let rot = -Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(rot) * R, cy + Math.sin(rot) * R);
  for (let i = 0; i < spikes; i++) {
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * R, cy + Math.sin(rot) * R);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function setFont(ctx: CanvasRenderingContext2D, weight: number, px: number, tracking = 0) {
  ctx.font = `${weight} ${px}px ${FONT}`;
  // letterSpacing is supported by modern canvas; guard for older engines.
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${tracking}px`;
  } catch {
    /* no-op */
  }
}

/**
 * Auto-generated, watermarked celebration graphic an owner can download and
 * post to social. Rendered entirely on a <canvas> using Foundly brand tokens,
 * then exported to PNG via `canvas.toDataURL` + an anchor download. No emoji,
 * no external libraries — the spark and star are drawn with canvas paths.
 */
export function MilestoneShareCard({
  milestone,
  business,
  rating,
  reviewCount,
}: {
  milestone: Milestone;
  business: string;
  rating?: number;
  reviewCount?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  const [ready, setReady] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const head = milestoneHeadline(milestone, { rating, reviewCount });
    const pad = 88;

    // Background: deep-green with a soft diagonal lift.
    const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    grad.addColorStop(0, HERO);
    grad.addColorStop(1, HERO_DEEP);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Decorative gold halos (subtle, off-canvas edges).
    ctx.fillStyle = "rgba(232,163,61,0.13)";
    ctx.beginPath();
    ctx.arc(SIZE - 90, 120, 300, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(232,163,61,0.07)";
    ctx.beginPath();
    ctx.arc(120, SIZE - 40, 220, 0, Math.PI * 2);
    ctx.fill();

    ctx.textBaseline = "alphabetic";

    // Kicker row: spark + tracked caps in gold.
    drawSpark(ctx, pad + 18, pad + 30, 22, GOLD);
    setFont(ctx, 700, 30, 6);
    ctx.fillStyle = GOLD;
    ctx.textAlign = "left";
    ctx.fillText(head.kicker.toUpperCase(), pad + 52, pad + 42);

    // Business name.
    setFont(ctx, 600, 44, 0);
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.fillText(business, pad, pad + 130);

    // Hero number — auto-fit to the available width.
    const maxWidth = SIZE - pad * 2 - (head.star ? 150 : 0);
    let heroSize = 340;
    setFont(ctx, 800, heroSize, 0);
    while (ctx.measureText(head.value).width > maxWidth && heroSize > 120) {
      heroSize -= 12;
      setFont(ctx, 800, heroSize, 0);
    }
    const heroBaseline = 660;
    ctx.fillStyle = WHITE;
    ctx.fillText(head.value, pad, heroBaseline);

    // Star accent for rating milestones, sat beside the hero number.
    if (head.star) {
      const w = ctx.measureText(head.value).width;
      drawStar(ctx, pad + w + 78, heroBaseline - heroSize * 0.34, 62, GOLD);
    }

    // Gold underline accent.
    ctx.fillStyle = GOLD;
    ctx.fillRect(pad, heroBaseline + 44, 132, 12);

    // Unit label.
    setFont(ctx, 600, 52, 0);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(head.label, pad, heroBaseline + 132);

    // Subtitle (from the milestone itself).
    setFont(ctx, 400, 34, 0);
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.fillText(milestone.subtitle, pad, heroBaseline + 188);

    // Footer divider.
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, SIZE - 128);
    ctx.lineTo(SIZE - pad, SIZE - 128);
    ctx.stroke();

    // Watermark: spark + "Reviews powered by Foundly".
    drawSpark(ctx, pad + 12, SIZE - 78, 16, GOLD);
    setFont(ctx, 700, 30, 0.5);
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillText("Reviews powered by Foundly", pad + 40, SIZE - 68);

    // Achieved date (right-aligned).
    setFont(ctx, 500, 28, 0);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.textAlign = "right";
    const when = new Date(milestone.achievedAt).toLocaleDateString("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    ctx.fillText(when, SIZE - pad, SIZE - 68);

    setReady(true);
  }, [milestone, business, rating, reviewCount]);

  useEffect(() => {
    draw();
  }, [draw]);

  const download = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${milestoneSlug(business, milestone)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("Image downloaded — ready to post", "success", "download");
    } catch {
      toast("Couldn't export the image — try again", "warning", "alert");
    }
  }, [business, milestone, toast]);

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label={`${business} milestone: ${milestone.title}. ${milestone.subtitle}.`}
        className="aspect-square w-full rounded-card shadow-lg"
      />
      <Button
        variant="gold"
        size="md"
        icon="download"
        fullWidth
        disabled={!ready}
        onClick={download}
        aria-label={`Download the ${milestone.title} share image as a PNG`}
      >
        Download image
      </Button>
    </div>
  );
}
