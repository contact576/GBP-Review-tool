"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";

/**
 * Right-side drawer on desktop, full-screen sheet on mobile.
 * Focus-managed dialog; Esc closes.
 */
export function Drawer({
  open, onClose, title, children, footer, wide,
}: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/30 animate-fade-in" onClick={onClose} />
      <div
        className={cn(
          "absolute right-0 top-0 bottom-0 flex w-full flex-col bg-paper shadow-lg animate-slide-in-right",
          wide ? "sm:w-[540px]" : "sm:w-[440px]",
        )}
      >
        <div className="flex items-center justify-between border-b border-hairline bg-card px-4 py-3">
          <h2 className="text-[16px] font-bold text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-btn text-sub hover:bg-primary-wash"
          >
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? <div className="border-t border-hairline bg-card p-4">{footer}</div> : null}
      </div>
    </div>
  );
}
