"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { type IconName } from "@/components/icons";
import { ToastProvider } from "@/components/ds/Toast";
import { readableText } from "@/lib/theme/contrast";
import { signOutAction } from "@/lib/actions";
import { Wallpaper } from "@/components/app/desktop/Wallpaper";
import { AppIcon, type AppIconTone } from "@/components/app/desktop/AppIcon";
import { Dock, type DockItem } from "@/components/app/desktop/Dock";
import { MenuBarClock } from "@/components/app/desktop/MenuBarClock";
import { SidebarClock } from "@/components/app/desktop/SidebarClock";
import { hexTint, hexMix } from "./brand";

export interface AgencyBrand {
  brandName: string;
  primary: string;
  accent: string;
  logoText: string;
}

/**
 * The agency console's apps. The Overview icon takes the agency's own brand
 * colour (`brand` tone reads the CSS variables set below); everything else
 * keeps Foundly's restrained palette so the white-label never fights it.
 */
const NAV: { href: string; label: string; icon: IconName; tone: AppIconTone; exact?: boolean }[] = [
  { href: "/agency", label: "Overview", icon: "grid", tone: "brand", exact: true },
  { href: "/agency/clients", label: "Clients", icon: "users", tone: "sky" },
  { href: "/agency/reports", label: "Reports", icon: "file", tone: "ink" },
  { href: "/agency/white-label", label: "White-label", icon: "sparkles", tone: "plum" },
  { href: "/agency/economics", label: "Economics", icon: "credit-card", tone: "mint" },
  { href: "/agency/activity", label: "Activity", icon: "clock", tone: "slate" },
];

const SIDEBAR_SPAN = 264;

function isActive(pathname: string, href: string): boolean {
  if (href === "/agency") return pathname === "/agency";
  return pathname === href || pathname.startsWith(href + "/");
}

function BrandMark({ brand, small }: { brand: AgencyBrand; small?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-extrabold text-ink", small ? "text-[16px]" : "text-[18px]")}>
      <span
        className={cn("app-icon", small ? "app-icon-sm text-[13px]" : "app-icon-md text-[15px]", "font-black")}
        style={{ "--ai-from": hexMix(brand.primary, "#FFFFFF", 0.22), "--ai-to": brand.primary, "--ai-shadow": hexTint(brand.primary, 0.5), color: readableText(brand.primary) } as React.CSSProperties}
        aria-hidden="true"
      >
        <span>{brand.logoText.slice(0, 1).toUpperCase()}</span>
      </span>
      <span className="truncate">{brand.brandName}</span>
    </span>
  );
}

/**
 * Agency console chrome — the desktop edition, in the agency's own brand.
 *
 * Same bones as the owner console (wallpaper, glass sidebar with a clock,
 * menu bar, Dock) with the agency's primary colour tinting the wallpaper,
 * the Overview app icon and the active state. This is THEIR product, so the
 * Foundly wordmark never appears here.
 */
export function AgencyShell({
  brand,
  children,
  hasBanner,
}: {
  brand: AgencyBrand;
  children: React.ReactNode;
  /** A 40px strip (demo) sits above the shell, so the floating chrome starts lower. */
  hasBanner?: boolean;
}) {
  const pathname = usePathname();

  const brandVars = {
    "--brand-from": hexMix(brand.primary, "#FFFFFF", 0.22),
    "--brand-to": brand.primary,
    "--brand-shadow": hexTint(brand.primary, 0.5),
  } as React.CSSProperties;

  const navLink = (active: boolean) =>
    cn(
      "relative flex min-h-10 items-center gap-3 rounded-[12px] px-2.5 text-[14px] font-medium transition-[background-color,color,box-shadow] duration-150",
      active
        ? "bg-white/80 text-ink shadow-[0_1px_2px_rgba(23,32,29,0.08),0_0_0_1px_rgba(23,32,29,0.05)]"
        : "text-sub hover:bg-white/40 hover:text-ink",
    );

  const dockItems: DockItem[] = NAV.map((item) => ({ ...item }));

  return (
    <ToastProvider>
      <div className="relative min-h-dvh" style={brandVars}>
        <Wallpaper tint={brand.primary} />

        {/* Desktop sidebar — the agency's own brand, not Foundly */}
        <aside
          className={cn(
            "glass-strong fixed bottom-3 left-3 z-30 hidden w-[240px] flex-col overflow-hidden rounded-sheet lg:flex",
            hasBanner ? "top-[52px]" : "top-3",
          )}
        >
          <div aria-hidden="true" className="h-1" style={{ backgroundColor: brand.primary }} />
          <div className="px-5 pb-3 pt-4">
            <BrandMark brand={brand} />
            <div className="kicker mt-1 text-faint">Growth control plane</div>
          </div>
          <div className="px-3 pb-2">
            <SidebarClock />
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1" aria-label="Agency navigation">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className={navLink(isActive(pathname, item.href))}>
                <AppIcon icon={item.icon} tone={item.tone} size="sm" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-soft p-3">
            <form action={signOutAction}>
              <button className={cn(navLink(false), "min-h-9 w-full text-[13px]")}>
                <AppIcon icon="external" tone="slate" size="sm" /> Sign out
              </button>
            </form>
          </div>
        </aside>

        <div className="relative z-[1] lg:pl-[264px]">
          {/* Menu bar */}
          <header className="sticky top-0 z-20 px-3 pt-3 lg:px-6 xl:px-8">
            <div className="glass-strong flex min-h-[60px] items-center justify-between gap-3 rounded-[20px] px-3 lg:px-5">
              <div className="min-w-0 lg:hidden">
                <BrandMark brand={brand} small />
              </div>
              <div className="hidden min-w-0 items-center gap-2 text-[13px] text-sub lg:flex">
                <span className="truncate">Agency console · {brand.brandName}</span>
              </div>
              <div className="flex items-center gap-2">
                <MenuBarClock className="hidden sm:inline-flex" />
                <form action={signOutAction} className="lg:hidden">
                  <button aria-label="Sign out" className="grid size-9 place-items-center rounded-full text-sub hover:bg-white/70 hover:text-ink">
                    <AppIcon icon="external" tone="slate" size="sm" />
                  </button>
                </form>
              </div>
            </div>
          </header>

          <main id="main" className="px-3 pb-32 pt-5 lg:px-6 lg:pb-[calc(var(--dock-h)+40px)] xl:px-8">
            <div className="mx-auto max-w-[1560px]">{children}</div>
          </main>
        </div>

        <Dock items={dockItems} pathname={pathname} offsetLeft={SIDEBAR_SPAN} ariaLabel="Agency dock" />
        <Dock
          variant="phone"
          ariaLabel="Primary"
          items={dockItems.slice(0, 5)}
          pathname={pathname}
          trailing={
            <Link href="/agency/activity" className="dock-item" aria-current={isActive(pathname, "/agency/activity") ? "page" : undefined}>
              <AppIcon icon="clock" tone="slate" size="md" glyphSize={19} />
              <span className="dock-label">Activity</span>
              <span className="dock-dot" aria-hidden="true" />
            </Link>
          }
        />
      </div>
    </ToastProvider>
  );
}
