"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

function bandColor(score: number): string {
  if (score >= 75) return "#0C7A63";
  if (score >= 50) return "#E8A33D";
  return "#C4452F";
}

/**
 * Local Growth Score dial (0–100). Rounded-cap arc over a hairline track,
 * with a count-up + arc-sweep on mount. Respects reduced motion.
 * Value is exposed as text for screen readers.
 */
export function ScoreDial({
  value,
  size = 200,
  label = "Local Growth Score",
  sublabel,
  delta,
  onHero = false,
}: {
  value: number;
  size?: number;
  label?: string;
  sublabel?: string;
  delta?: number;
  onHero?: boolean;
}) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value]);

  const stroke = size * 0.09;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const arcFraction = 0.75; // 270° arc
  const arcLen = circumference * arcFraction;
  const progress = (display / 100) * arcLen;
  const color = bandColor(value);
  const trackColor = onHero ? "rgba(255,255,255,0.16)" : "#E7E5DE";

  const ariaLabel =
    `${label}: ${value} of 100` +
    (sublabel ? `, ${sublabel}` : "") +
    (typeof delta === "number" ? `, ${delta >= 0 ? "up" : "down"} ${Math.abs(delta)} this month` : "");

  return (
    <div className="inline-flex flex-col items-center" role="img" aria-label={ariaLabel}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[135deg]" aria-hidden="true">
          <circle
            cx={cx} cy={cx} r={r} fill="none" stroke={trackColor}
            strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${arcLen} ${circumference}`}
          />
          <circle
            cx={cx} cy={cx} r={r} fill="none" stroke={onHero ? "#E8A33D" : color}
            strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            className="transition-[stroke-dasharray] duration-350"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn("font-extrabold tabular-nums leading-none", onHero ? "text-white" : "text-ink")}
            style={{ fontSize: size * 0.28 }}
          >
            {display}
          </span>
          <span className={cn("kicker mt-1", onHero && "text-white/70")}>/ 100</span>
        </div>
      </div>
      <div className="mt-2 text-center">
        <div className={cn("text-[14px] font-semibold", onHero ? "text-white" : "text-ink")}>{label}</div>
        {sublabel ? <div className={cn("text-[12px]", onHero ? "text-white/70" : "text-sub")}>{sublabel}</div> : null}
        {typeof delta === "number" ? (
          <div className={cn("mt-0.5 text-[12px] font-semibold", onHero ? "text-gold" : delta >= 0 ? "text-primary" : "text-danger")}>
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)} this month
          </div>
        ) : null}
      </div>
    </div>
  );
}
