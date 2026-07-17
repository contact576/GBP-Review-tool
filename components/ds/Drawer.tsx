"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";

/**
 * Right-side drawer on desktop, full-screen sheet on mobile.
 * Focus-managed dialog; Esc closes. Focus is trapped while open and
 * restored to the opener on close.
 */
export function Drawer({
  open, onClose, title, children, footer, wide,
}: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Remember what had focus so we can restore it when the drawer closes.
    openerRef.current = (document.activeElement as HTMLElement | null) ?? null;

    const panel = panelRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusable = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)) : [];

    // Move focus to the first focusable element inside the drawer on open.
    const initial = getFocusable();
    (initial[0] ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      // Trap focus: cycle within the panel with Tab / Shift+Tab.
      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        panel?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panel?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel?.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      // Restore focus to the element that opened the drawer.
      openerRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/30 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "absolute right-0 top-0 bottom-0 flex w-full flex-col bg-paper shadow-halo animate-slide-in-right",
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
