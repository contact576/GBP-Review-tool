"use client";

import { useEffect } from "react";

/**
 * Fires a brief, gold-toned confetti burst — ONLY on genuine milestones/success.
 * Non-blocking, never loops, and disabled under prefers-reduced-motion.
 */
export function Confetti({ fire }: { fire: boolean }) {
  useEffect(() => {
    if (!fire) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    import("canvas-confetti").then((mod) => {
      if (cancelled) return;
      const confetti = mod.default;
      confetti({
        particleCount: 90,
        spread: 68,
        origin: { y: 0.6 },
        colors: ["#E8A33D", "#0C7A63", "#C77E1B", "#0C4A3E"],
        ticks: 160,
        disableForReducedMotion: true,
      });
    });
    return () => { cancelled = true; };
  }, [fire]);

  return null;
}
