"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";
import { ToastProvider } from "@/components/ds/Toast";
import { signOutAction } from "@/lib/actions";
import { Wallpaper } from "@/components/app/desktop/Wallpaper";
import { AppIcon, type AppIconTone } from "@/components/app/desktop/AppIcon";
import { Dock, type DockItem } from "@/components/app/desktop/Dock";
import { MenuBarClock } from "@/components/app/desktop/MenuBarClock";
import { SidebarClock } from "@/components/app/desktop/SidebarClock";

const NAV: { href: string; label: string; icon: IconName; tone: AppIconTone; exact?: boolean }[] = [
  { href: "/admin", label: "Overview", icon: "grid", tone: "green", exact: true },
  { href: "/admin/tenants", label: "Tenants", icon: "building", tone: "sky" },
  { href: "/admin/billing", label: "Billing", icon: "credit-card", tone: "mint" },
  { href: "/admin/delivery", label: "Delivery", icon: "send", tone: "plum" },
  { href: "/admin/fraud", label: "Fraud", icon: "shield", tone: "rose" },
  { href: "/admin/durability", label: "Durability", icon: "trend", tone: "slate" },
  { href: "/admin/flags", label: "Flags", icon: "flag", tone: "sky" },
  { href: "/admin/audit", label: "Audit", icon: "lock", tone: "slate" },
];

const SIDEBAR_SPAN = 264;

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

function OpsMark() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-7 place-items-center rounded-btn bg-danger text-[13px] font-black text-white">F</span>
      <div className="leading-tight">
        <div className="text-[14px] font-extrabold text-white">Foundly Ops</div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/40">Internal console</div>
      </div>
    </div>
  );
}

/**
 * Ops console chrome — the desktop edition in ink glass. Same wallpaper,
 * clock, menu bar and Dock as the owner console, but every panel of chrome is
 * translucent graphite so the surface is unmistakably internal.
 */
export function AdminShell({ children, hasBanner }: { children: React.ReactNode; hasBanner?: boolean }) {
  const pathname = usePathname();

  const navLink = (active: boolean) =>
    cn(
      "flex min-h-10 items-center gap-3 rounded-[12px] px-2.5 text-[14px] font-medium transition-colors",
      active
        ? "bg-white/[.16] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.14)]"
        : "text-white/60 hover:bg-white/[.08] hover:text-white",
    );

  const dockItems: DockItem[] = NAV.map((item) => ({ ...item }));

  return (
    <ToastProvider>
      <div className="relative min-h-dvh">
        <Wallpaper />
        {/* Desktop sidebar — ink glass */}
        <aside
          className={cn(
            "glass-ink fixed bottom-3 left-3 z-30 hidden w-[240px] flex-col overflow-hidden rounded-sheet lg:flex",
            hasBanner ? "top-[52px]" : "top-3",
          )}
        >
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <OpsMark />
            <span className="inline-flex items-center gap-1 rounded-chip bg-danger px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
              <Icon name="lock" size={11} /> Internal
            </span>
          </div>
          <div className="px-3 pb-2">
            <SidebarClock inverse className="bg-white/[.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" />
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1" aria-label="Ops navigation">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className={navLink(isActive(pathname, item.href))}>
                <AppIcon icon={item.icon} tone={item.tone} size="sm" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-white/10 p-3">
            <form action={signOutAction}>
              <button className={cn(navLink(false), "min-h-9 w-full text-[13px]")}>
                <AppIcon icon="external" tone="slate" size="sm" /> Sign out
              </button>
            </form>
          </div>
        </aside>

        <div className="relative z-[1] lg:pl-[264px]">
          {/* Menu bar — ink, clearly internal */}
          <header className="sticky top-0 z-20 px-3 pt-3 lg:px-6 xl:px-8">
            <div className="glass-ink flex min-h-[60px] items-center justify-between gap-3 rounded-[20px] px-3 lg:px-5">
              <div className="flex items-center gap-2 lg:hidden">
                <OpsMark />
              </div>
              <div className="hidden items-center gap-2 lg:flex">
                <span className="text-[13px] text-white/60">Internal · Foundly Ops · never tenant-facing</span>
              </div>
              <div className="flex items-center gap-2">
                <MenuBarClock inverse className="hidden sm:inline-flex" />
                <form action={signOutAction} className="lg:hidden">
                  <button aria-label="Sign out" className="grid size-9 place-items-center rounded-full text-white/60 hover:bg-white/10">
                    <Icon name="external" size={20} />
                  </button>
                </form>
              </div>
            </div>
          </header>

          <main id="main" className="px-3 pb-32 pt-5 lg:px-6 lg:pb-[calc(var(--dock-h)+40px)] xl:px-8">
            <div className="mx-auto max-w-[1560px]">{children}</div>
          </main>
        </div>

        <Dock items={dockItems} pathname={pathname} offsetLeft={SIDEBAR_SPAN} className="glass-ink" ariaLabel="Ops dock" />
        <Dock variant="phone" ariaLabel="Primary" items={dockItems.slice(0, 5)} pathname={pathname} className="glass-ink dock-inverse" />
      </div>
    </ToastProvider>
  );
}
