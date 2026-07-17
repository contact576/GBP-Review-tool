"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

export interface NavSection {
  id: string;
  label: string;
}

/**
 * Solid warm-paper sticky sub-nav with an underline section switcher.
 *
 * Per DESIGN-MAKEOVER (Analytics + governing principle #1): sticky bars are
 * SOLID high-opacity warm paper + hairline bottom — never frosted / backdrop-
 * blur (a cool idiom that greys the warm canvas). Scroll-spy underlines the
 * section in view; clicking scrolls to it.
 */
export function SectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const lockedTo = useRef<string | null>(null);

  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (!els.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const top = visible[0];
        if (!top) return;
        // After a click, hold the target active until it actually reaches view.
        if (lockedTo.current && lockedTo.current !== top.target.id) return;
        lockedTo.current = null;
        setActive(top.target.id);
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  function go(id: string) {
    lockedTo.current = id;
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav
      aria-label="Sections"
      className="sticky top-[60px] z-10 -mt-1 mb-1 border-b border-hairline bg-paper"
    >
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {sections.map((s) => {
          const on = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => go(s.id)}
              aria-current={on ? "true" : undefined}
              className={cn(
                "shrink-0 border-b-2 px-1.5 py-3 text-[13px] transition-colors",
                on
                  ? "border-primary font-bold text-ink"
                  : "border-transparent font-medium text-sub hover:text-ink",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
