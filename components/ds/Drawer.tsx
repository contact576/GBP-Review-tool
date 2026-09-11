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
      <div className="absolute inset-0 bg-ink/25 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "glass-strong absolute right-0 top-0 bottom-0 flex w-full flex-col overflow-hidden shadow-glass-lg animate-slide-in-right sm:bottom-3 sm:right-3 sm:top-3 sm:rounded-sheet",
          wide ? "sm:w-[540px]" : "sm:w-[440px]",
        )}
      >
        <div className="flex items-center justify-between border-b border-soft px-5 py-3.5">
          <h2 className="text-[16px] font-bold text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full text-sub hover:bg-ink/[.06] hover:text-ink"
          >
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? <div className="border-t border-soft bg-white/40 p-4">{footer}</div> : null}
      </div>
    </div>
  );
}
