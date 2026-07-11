"use client";

import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";

/** Bottom-fixed, full-width primary action for phone-first flows. */
export function MegaCTA({
  label, onClick, icon, loading, disabled, tone = "primary", sticky = true,
}: {
  label: string; onClick?: () => void; icon?: IconName; loading?: boolean;
  disabled?: boolean; tone?: "primary" | "gold"; sticky?: boolean;
}) {
  return (
    <div className={cn(sticky && "sticky bottom-0 z-20 bg-gradient-to-t from-paper via-paper to-transparent pb-4 pt-3", "px-1")}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className={cn(
          "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-btn px-6 text-[16px] font-bold shadow-lg transition-all active:scale-[0.99] disabled:opacity-50",
          tone === "primary" ? "bg-primary text-white hover:bg-primary-dark" : "bg-gold text-ink hover:bg-gold-deep hover:text-white",
        )}
      >
        {loading ? (
          <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : icon ? (
          <Icon name={icon} size={20} />
        ) : null}
        {label}
      </button>
    </div>
  );
}
