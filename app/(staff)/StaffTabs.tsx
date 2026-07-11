"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/staff", label: "Capture", icon: "plus" },
  { href: "/staff/qr", label: "Kiosk QR", icon: "qr" },
  { href: "/staff/leaderboard", label: "My stats", icon: "trophy" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/staff") return pathname === "/staff";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Fixed, thumb-reachable bottom tab row for the staff PWA. */
export function StaffTabs() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline bg-card">
      {TABS.map((tab) => {
        const active = isActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-[60px] flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors",
              active ? "text-primary" : "text-faint",
            )}
          >
            <Icon name={tab.icon} size={22} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
