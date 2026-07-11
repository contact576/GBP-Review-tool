"use client";

import { cn } from "@/lib/utils/cn";

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

export function Tabs({
  items, active, onChange, className,
}: {
  items: TabItem[]; active: string; onChange: (key: string) => void; className?: string;
}) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto no-scrollbar", className)} role="tablist">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.key)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip px-3.5 py-2 text-[13px] font-semibold transition-colors min-h-[40px]",
              isActive ? "bg-ink text-white" : "bg-card text-sub border border-hairline hover:text-ink",
            )}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span className={cn("data-chip rounded-chip px-1.5", isActive ? "bg-white/20" : "bg-primary-wash text-primary-dark")}>
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
