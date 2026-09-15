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
        underline
          ? "flex gap-1 overflow-x-auto no-scrollbar border-b border-soft"
          : "glass inline-flex max-w-full gap-0.5 overflow-x-auto no-scrollbar rounded-full p-[3px]",
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
                    "rounded-chip px-3.5 py-2 min-h-[36px]",
                    isActive
                      ? "bg-white text-ink shadow-[0_1px_2px_rgba(23,32,29,0.1),0_0_0_1px_rgba(23,32,29,0.05)]"
                      : "text-sub hover:text-ink",
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
                      : "bg-primary-tint text-primary-dark"
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
