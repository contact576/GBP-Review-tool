"use client";

import { cn } from "@/lib/utils/cn";

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

/**
 * Two scoped idioms (both default-safe — omit `variant` for the original pill):
 *   - "pill"      solid ink pill — view switching (default, unchanged look)
 *   - "underline" 2px green underline + weight bump — in-page segmentation
 */
export function Tabs({
  items, active, onChange, className, variant = "pill",
}: {
  items: TabItem[]; active: string; onChange: (key: string) => void; className?: string;
  variant?: "pill" | "underline";
}) {
  const underline = variant === "underline";
  return (
    <div
      className={cn(
        "flex overflow-x-auto no-scrollbar",
        underline ? "gap-1 border-b border-hairline" : "gap-1",
        className,
      )}
      role="tablist"
    >
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.key)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold transition-colors min-h-[40px]",
              underline
                ? cn(
                    "-mb-px border-b-2 px-3.5 py-2.5",
                    isActive
                      ? "border-primary text-ink"
                      : "border-transparent text-sub hover:text-ink",
                  )
                : cn(
                    "rounded-chip px-3.5 py-2",
                    isActive
                      ? "bg-ink text-white"
                      : "bg-card text-sub border border-hairline hover:text-ink",
                  ),
            )}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span
                className={cn(
                  "data-chip rounded-chip px-1.5",
                  isActive
                    ? underline
                      ? "bg-primary-tint text-primary-dark"
                      : "bg-white/20"
                    : "bg-primary-wash text-primary-dark",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
