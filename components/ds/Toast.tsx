"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";

interface ToastItem {
  id: number;
  message: string;
  tone: "success" | "info" | "warning" | "danger";
  icon?: IconName;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastItem["tone"], icon?: IconName) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) return { toast: () => {} };
  return ctx;
}

const toneStyles: Record<ToastItem["tone"], string> = {
  success: "bg-ink text-white",
  info: "bg-ink text-white",
  warning: "bg-gold-tint text-gold-deep border border-gold/40",
  danger: "bg-danger text-white",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback<ToastContextValue["toast"]>((message, tone = "success", icon) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, tone, icon: icon ?? (tone === "success" ? "check-circle" : undefined) }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none"
        aria-live="polite"
        role="status"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-center gap-2 rounded-btn px-4 py-3 text-[14px] font-medium shadow-lg animate-slide-up max-w-sm",
              toneStyles[t.tone],
            )}
          >
            {t.icon ? <Icon name={t.icon} size={18} /> : null}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
