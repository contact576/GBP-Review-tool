"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";

/** Accessible star rating — a labelled radio group (keyboard + SR operable). */
export function StarSelector({
  value, onChange, size = 44,
}: {
  value: number; onChange: (v: 1 | 2 | 3 | 4 | 5) => void; size?: number;
}) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  return (
    <div role="radiogroup" aria-label="Rate your experience" className="flex items-center justify-center gap-2">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= active;
        return (
          <button
            key={n}
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => onChange(n as 1 | 2 | 3 | 4 | 5)}
            className={cn("grid place-items-center rounded-md p-1 transition-transform hover:scale-110", "min-h-[44px] min-w-[44px]")}
          >
            <Icon
              name={filled ? "star-fill" : "star"}
              size={size}
              className={filled ? "text-star" : "text-hairline"}
            />
          </button>
        );
      })}
    </div>
  );
}
