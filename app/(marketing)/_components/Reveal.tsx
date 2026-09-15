"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Scroll reveal for marketing sections — content rises a few pixels as it
 * enters the viewport, the way the product pages ease a section in.
 *
 * Progressive by design: the hidden state is added *after* mount, so if JS
 * never runs (or IntersectionObserver is missing) the content renders plainly
 * visible instead of staying blank. Reduced motion is honoured in CSS.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  /** Stagger in ms, for sibling cards revealing in sequence. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;

    el.classList.add("mk-reveal");
    if (delay) el.style.transitionDelay = `${delay}ms`;

    const show = () => {
      el.classList.add("is-in");
      io.unobserve(el);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) show();
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0 },
    );
    io.observe(el);

    // Already on screen at mount (above the fold): play immediately rather
    // than waiting for a scroll that may never come.
    if (el.getBoundingClientRect().top < window.innerHeight) show();

    // Fail-safe. A reveal that never fires would leave a section permanently
    // blank, which is far worse than losing the animation — so after a beat
    // the content shows itself regardless of what the observer did.
    const failsafe = window.setTimeout(show, 1600);

    return () => {
      window.clearTimeout(failsafe);
      io.disconnect();
    };
  }, [delay]);

  return (
    // @ts-expect-error — ref type narrows per tag; all three are HTMLElement.
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
