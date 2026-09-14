"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import type { IconName } from "@/components/icons";
import { AppIcon, type AppIconTone } from "./AppIcon";

export interface DockItem {
  label: string;
  href: string;
  icon: IconName;
  tone: AppIconTone;
  /** `data-tour` id so the product tour can spotlight this item. */
  tour?: string;
  /** Small count bubble (unread notifications). */
  badge?: number;
  /** Match only the exact path (home), not every path beneath it. */
  exact?: boolean;
}

export function dockItemActive(pathname: string, item: Pick<DockItem, "href" | "exact">): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function DockLink({ item, pathname, phone }: { item: DockItem; pathname: string; phone: boolean }) {
  const active = dockItemActive(pathname, item);
  return (
    <Link
      href={item.href}
      data-tour={item.tour}
      aria-current={active ? "page" : undefined}
      aria-label={phone ? undefined : item.label}
      className="dock-item"
    >
      <span className="relative">
        <AppIcon icon={item.icon} tone={item.tone} size={phone ? "md" : "dock"} glyphSize={phone ? 19 : 22} />
        {item.badge ? (
          <span className="absolute -right-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-extrabold leading-[18px] text-white shadow-[0_0_0_2px_rgba(255,255,255,0.9)]">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
      </span>
      <span className="dock-label">{item.label}</span>
      <span className="dock-dot" aria-hidden="true" />
    </Link>
  );
}

/**
 * The Dock: a floating glass capsule of app icons along the bottom of the
 * desktop. On a desktop it is a quick launcher — icons magnify on hover and
 * name themselves in a tooltip. On a phone (`variant="phone"`) it is the
 * primary navigation: bigger touch targets with the label underneath. The
 * dot under an icon marks the section currently open.
 *
 * `secondary` items sit after a divider (utilities such as Notifications and
 * Settings); `trailing` takes any extra control (a More or Sign out button).
 * `offsetLeft` centres the desktop dock inside the content area when a
 * sidebar occupies the left edge.
 */
export function Dock({
  items,
  secondary = [],
  pathname,
  variant = "desktop",
  offsetLeft = 0,
  trailing,
  className,
  ariaLabel = "Dock",
}: {
  items: DockItem[];
  secondary?: DockItem[];
  pathname: string;
  variant?: "desktop" | "phone";
  offsetLeft?: number;
  trailing?: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const phone = variant === "phone";
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "glass-strong dock",
        phone ? "dock-phone fixed inset-x-3 bottom-3 z-30 lg:hidden" : "fixed bottom-3 z-30 hidden lg:flex",
        className,
      )}
      style={
        phone
          ? { marginBottom: "env(safe-area-inset-bottom)" }
          : { left: `calc(50% + ${offsetLeft / 2}px)`, transform: "translateX(-50%)" }
      }
    >
      {items.map((item) => (
        <DockLink key={item.href} item={item} pathname={pathname} phone={phone} />
      ))}
      {secondary.length || trailing ? <span className="dock-divider" aria-hidden="true" /> : null}
      {secondary.map((item) => (
        <DockLink key={item.href} item={item} pathname={pathname} phone={phone} />
      ))}
      {trailing}
    </nav>
  );
}

/** A non-navigating Dock slot (More, Sign out) sharing the item styling. */
export function DockButton({
  label,
  icon,
  tone = "slate",
  onClick,
  phone,
  className,
  type = "button",
}: {
  label: string;
  icon: IconName;
  tone?: AppIconTone;
  onClick?: () => void;
  phone?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button type={type} onClick={onClick} aria-label={phone ? undefined : label} className={cn("dock-item", className)}>
      <AppIcon icon={icon} tone={tone} size={phone ? "md" : "dock"} glyphSize={phone ? 19 : 22} />
      <span className="dock-label">{label}</span>
      <span className="dock-dot" aria-hidden="true" />
    </button>
  );
}
