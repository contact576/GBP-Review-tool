"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";

const RATING_LABELS = ["Tap a star to rate", "Poor", "Fair", "Good", "Great", "Excellent"] as const;

/** Accessible star rating — a labelled radio group (keyboard + SR operable). */
export function StarSelector({
  value, onChange, size = 48, showLabel = false,
}: {
  value: number; onChange: (v: 1 | 2 | 3 | 4 | 5) => void; size?: number; showLabel?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  return (
    <div className="flex flex-col items-center gap-3">
      <div role="radiogroup" aria-label="Rate your experience" className="flex items-center justify-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= active;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(0)}
              onClick={() => onChange(n as 1 | 2 | 3 | 4 | 5)}
              className="grid min-h-[52px] min-w-[52px] place-items-center rounded-btn p-1 transition-transform duration-150 hover:scale-110 active:scale-95"
            >
              <Icon
                name={filled ? "star-fill" : "star"}
                size={size}
                className={cn("transition-colors", filled ? "text-star" : "text-hairline")}
              />
            </button>
          );
        })}
      </div>
      {showLabel ? (
        <div
          aria-live="polite"
          className={cn(
            "text-[14px] font-semibold transition-colors",
            active > 0 ? "text-primary" : "text-faint",
          )}
        >
          {RATING_LABELS[active] ?? RATING_LABELS[0]}
        </div>
      ) : null}
    </div>
  );
}
