"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { trialLockAllowsPath } from "@/lib/billing/trial";
import { Icon } from "@/components/icons";
import { FoundlyMark } from "@/components/icons/FoundlyMark";
import { Badge } from "@/components/ds/misc";
import { ToastProvider } from "@/components/ds/Toast";
import { ProductTour } from "./ProductTour";
import { BOTTOM_TABS, MORE_ITEMS, type NavItem } from "./nav";
import { signOutAction, switchWorkspaceAction } from "@/lib/actions";
import type { OrganizationWorkspaceSummary } from "@/lib/data/provider";
import { Wallpaper } from "./desktop/Wallpaper";
import { AppIcon, type AppIconTone } from "./desktop/AppIcon";
import { Dock, DockButton, type DockItem } from "./desktop/Dock";
import { MenuBarClock } from "./desktop/MenuBarClock";
import { SidebarClock } from "./desktop/SidebarClock";
import { Greeting } from "./desktop/Greeting";

/**
 * The owner console's apps. One list drives the sidebar, the desktop Dock and
 * the phone Dock, so a section has the same icon and colour wherever it is
 * launched from. Tones are restrained on purpose (DESIGN.md): the product is
 * the green family, sky and graphite are neutral tools, gold is earned only.
 */
const APPS: (NavItem & { tone: AppIconTone; tour: string; exact?: boolean })[] = [
  { label: "Overview", href: "/app", icon: "home", tone: "green", tour: "nav-overview", exact: true },
  { label: "This week", href: "/app/this-week", icon: "sparkles", tone: "mint", tour: "nav-this-week" },
  { label: "Content Studio", href: "/app/studio", icon: "pencil", tone: "plum", tour: "nav-studio" },
  { label: "Reviews", href: "/app/reviews", icon: "star", tone: "sky", tour: "nav-reviews" },
  { label: "Visibility", href: "/app/visibility", icon: "map-pin", tone: "ink", tour: "nav-visibility" },
  { label: "Campaigns", href: "/app/campaigns", icon: "megaphone", tone: "rose", tour: "nav-campaigns" },
  { label: "Customers", href: "/app/customers", icon: "users", tone: "slate", tour: "nav-customers" },
  { label: "Analytics", href: "/app/analytics", icon: "chart", tone: "green", tour: "nav-analytics" },
];

const TONE_BY_HREF: Record<string, AppIconTone> = Object.fromEntries(APPS.map((app) => [app.href, app.tone]));
const EXTRA_TONES: Record<string, AppIconTone> = {
  "/app/requests": "mint",
  "/app/whatsapp": "green",
  "/app/profile": "sky",
  "/app/benchmark": "slate",
  "/app/rank-grid": "ink",
  "/app/report": "plum",
  "/app/milestones": "gold",
  "/app/settings/business": "ink",
  "/app/notifications": "slate",
};
function toneFor(href: string): AppIconTone {
  return TONE_BY_HREF[href] ?? EXTRA_TONES[href] ?? "slate";
}

/** Bottom-tab `data-tour` ids, keyed by href, so the phone tour can spotlight them. */
const TAB_TOUR: Record<string, string> = {
  "/app": "tab-overview",
  "/app/this-week": "tab-this-week",
  "/app/reviews": "tab-reviews",
  "/app/customers": "tab-customers",
};

/** Sidebar width + its 12px inset on each side — what the Dock centres against. */
const SIDEBAR_SPAN = 264;

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Owner console chrome — the desktop edition.
 *
 * A living wallpaper, a floating glass sidebar with a clock widget and
 * app-icon navigation, a menu bar with the live time, and a Dock of app icons
 * along the bottom. Content scrolls *under* every piece of chrome and shows
 * through it. On a phone the Dock becomes the tab bar.
 */
export function AppShell({
  children,
  business,
  ownerName,
  ownerEmail,
  trialDaysLeft,
  trialEnded,
  trialLocked,
  unread,
  locations,
  currentWorkspaceId,
  agencyMode,
  isDemo,
  hasBanner,
}: {
  children: React.ReactNode;
  business: string;
  ownerName: string;
  ownerEmail?: string;
  /** Whole days left on a live trial; undefined when not trialing. */
  trialDaysLeft?: number;
  /** The trial's end date has passed and nothing paid replaced it. */
  trialEnded?: boolean;
  /**
   * This session is locked out of the app until it pays or continues on Free
   * (decided server-side in app/(app)/layout.tsx). The shell re-applies the
   * redirect on client-side navigation, which a shared layout never sees.
   */
  trialLocked?: boolean;
  unread?: number;
  locations: OrganizationWorkspaceSummary[];
  currentWorkspaceId: string;
  agencyMode?: boolean;
  isDemo?: boolean;
  /** A 40px strip (demo, or agency acting-as) sits above the shell. */
  hasBanner?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const dashboardHome = pathname === "/app";

  useEffect(() => {
    if (trialLocked && !trialLockAllowsPath(pathname)) router.replace("/app/trial-ending");
  }, [trialLocked, pathname, router]);

  const navLink = (active: boolean) =>
    cn(
      "relative flex min-h-10 items-center gap-3 rounded-[12px] px-2.5 text-[14px] font-medium transition-[background-color,color,box-shadow] duration-150",
      active
        ? "bg-white/80 text-ink shadow-[0_1px_2px_rgba(23,32,29,0.08),0_0_0_1px_rgba(23,32,29,0.05)]"
        : "text-sub hover:bg-white/40 hover:text-ink",
    );

  const dockItems: DockItem[] = APPS.map((app) => ({
    label: app.label,
    href: app.href,
    icon: app.icon,
    tone: app.tone,
    exact: app.exact,
  }));
  const dockSecondary: DockItem[] = [
    { label: "Notifications", href: "/app/notifications", icon: "bell", tone: "slate", badge: unread },
    { label: "Settings", href: "/app/settings/business", icon: "settings", tone: "ink" },
  ];
  const phoneItems: DockItem[] = BOTTOM_TABS.map((tab) => ({
    label: tab.label,
    href: tab.href,
    icon: tab.icon,
    tone: toneFor(tab.href),
    tour: TAB_TOUR[tab.href],
    exact: tab.href === "/app",
  }));

  return (
    <ToastProvider>
      {/* useSearchParams needs a Suspense boundary; the tour renders nothing until it runs. */}
      <Suspense fallback={null}>
        <ProductTour workspaceId={currentWorkspaceId} isDemo={isDemo} />
      </Suspense>
      <div className="relative min-h-dvh">
        <Wallpaper />

        {/* ── Desktop sidebar: a floating glass panel ─────────── */}
        <aside
          className={cn(
            "glass-strong fixed bottom-3 left-3 z-30 hidden w-[240px] flex-col overflow-hidden rounded-sheet lg:flex",
            hasBanner || isDemo ? "top-[52px]" : "top-3",
          )}
        >
          <div className="flex h-[68px] items-center px-5">
            <Wordmark />
          </div>

          <div className="px-3 pb-2">
            <SidebarClock />
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1" aria-label="Main navigation">
            {APPS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link key={item.href} href={item.href} data-tour={item.tour} className={navLink(active)}>
                  <AppIcon icon={item.icon} tone={item.tone} size="sm" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="px-3 pb-3">
            <Link
              href="/app/milestones"
              className="glass-dark on-hero block rounded-[18px] p-4 transition-[background-color] hover:bg-hero/90"
            >
              <span className="mb-3 grid size-8 place-items-center rounded-full bg-gold/20 text-gold">
                <Icon name="sparkles" size={16} />
              </span>
              <span className="block text-[13px] font-bold leading-snug text-white">Refer a business. Grow together.</span>
              <span className="mt-1.5 block text-[11px] leading-relaxed text-white/60">
                Give another local business a stronger start and earn account credit.
              </span>
              <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-gold">
                Invite now <Icon name="arrow-right" size={13} />
              </span>
            </Link>
          </div>

          <div className="space-y-0.5 border-t border-soft p-3">
            {agencyMode ? (
              <Link href="/agency" className={cn(navLink(false), "min-h-9 text-[13px] font-semibold text-ink")}>
                <AppIcon icon="grid" tone="green" size="sm" /> Agency console
              </Link>
            ) : null}
            <Link
              href="/app/settings/business"
              data-tour="nav-settings"
              className={cn(navLink(pathname.startsWith("/app/settings")), "min-h-9 text-[13px]")}
            >
              <AppIcon icon="settings" tone="ink" size="sm" /> Settings
            </Link>
            <form action={signOutAction}>
              <button className={cn(navLink(false), "min-h-9 w-full text-[13px]")}>
                <AppIcon icon="external" tone="slate" size="sm" /> Sign out
              </button>
            </form>
          </div>
        </aside>

        <div className="relative z-[1] lg:pl-[264px]">
          {/* ── Menu bar ─────────────────────────────────────── */}
          <header className="sticky top-0 z-20 px-3 pt-3 lg:px-6 lg:pt-3 xl:px-8">
            <div className="glass-strong flex min-h-[60px] items-center justify-between gap-3 rounded-[20px] px-3 lg:px-5">
              <div className="flex items-center gap-2 lg:hidden">
                <Wordmark small />
              </div>

              {dashboardHome ? (
                <div className="hidden min-w-0 lg:block">
                  <h1 className="text-[20px] font-bold leading-tight tracking-tight text-ink">
                    <Greeting name={ownerName.split(" ")[0] ?? ownerName} />
                  </h1>
                  <DashboardBusinessSwitcher
                    business={business}
                    locations={locations}
                    currentWorkspaceId={currentWorkspaceId}
                  />
                </div>
              ) : (
                <LocationSwitcher
                  business={business}
                  locations={locations}
                  currentWorkspaceId={currentWorkspaceId}
                />
              )}

              <div className="flex items-center gap-1.5 sm:gap-2">
                {dashboardHome ? <DashboardDateRange /> : null}
                {!dashboardHome && agencyMode ? (
                  <Link href="/agency" className="hidden sm:inline-flex">
                    <Badge tone="primary" icon="grid">Agency</Badge>
                  </Link>
                ) : null}
                {trialEnded ? (
                  <Link href="/app/settings/billing" className="hidden sm:inline-flex">
                    <Badge tone="danger" icon="clock">Trial ended</Badge>
                  </Link>
                ) : typeof trialDaysLeft === "number" ? (
                  <Link href="/app/settings/billing" className="hidden sm:inline-flex">
                    <Badge tone="gold" icon="clock">
                      Trial · {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"} left
                    </Badge>
                  </Link>
                ) : null}
                <MenuBarClock className="hidden sm:inline-flex" />
                <Link
                  href="/app/notifications"
                  aria-label="Notifications"
                  className="relative grid size-10 place-items-center rounded-full text-sub transition-colors hover:bg-white/70 hover:text-ink"
                >
                  <Icon name="bell" size={20} />
                  {unread ? (
                    <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-gold px-1 text-[9px] font-extrabold leading-4 text-ink shadow-sm">
                      {unread}
                    </span>
                  ) : null}
                </Link>
                <AccountMenu ownerName={ownerName} ownerEmail={ownerEmail} showChevron={dashboardHome} />
              </div>
            </div>
          </header>

          <main id="main" className="px-3 pb-32 pt-5 lg:px-6 lg:pb-[calc(var(--dock-h)+40px)] lg:pt-6 xl:px-8">
            <div className={cn("mx-auto", dashboardHome ? "max-w-[1500px]" : "max-w-[1400px]")}>{children}</div>
          </main>
        </div>

        {/* ── The Dock ─────────────────────────────────────────── */}
        <Dock items={dockItems} secondary={dockSecondary} pathname={pathname} offsetLeft={SIDEBAR_SPAN} />
        <Dock
          variant="phone"
          ariaLabel="Primary"
          items={phoneItems}
          pathname={pathname}
          trailing={<DockButton phone label="More" icon="more" tone="slate" onClick={() => setMoreOpen(true)} />}
        />

        {moreOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
            <div className="absolute inset-0 bg-ink/25 backdrop-blur-[2px] animate-fade-in" onClick={() => setMoreOpen(false)} />
            <div className="glass-strong absolute inset-x-2 bottom-2 rounded-sheet p-4 pb-6 animate-slide-up">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15" />
              <div className="grid grid-cols-4 gap-2">
                {MORE_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-1.5 rounded-[16px] p-2 text-center"
                  >
                    <AppIcon icon={item.icon} tone={toneFor(item.href)} size="lg" />
                    <span className="text-[11px] font-medium leading-tight text-ink">{item.label}</span>
                  </Link>
                ))}
              </div>
              <form action={signOutAction} className="mt-4">
                <button className="w-full rounded-full bg-white/60 py-3 text-[14px] font-semibold text-sub shadow-[0_0_0_1px_rgba(23,32,29,0.05)]">Sign out</button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </ToastProvider>
  );
}

function LocationSwitcher({
  business,
  locations,
  currentWorkspaceId,
}: {
  business: string;
  locations: OrganizationWorkspaceSummary[];
  currentWorkspaceId: string;
}) {
  if (locations.length <= 1) {
    return (
      <div className="hidden min-w-0 items-center gap-2 lg:flex">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon name="map-pin" size={15} />
        </span>
        <span className="truncate text-[14px] font-semibold text-ink">{business}</span>
      </div>
    );
  }

  return (
    <form action={switchWorkspaceAction} className="hidden min-w-0 items-center gap-2 sm:flex">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon name="building" size={15} />
      </span>
      <label className="sr-only" htmlFor="workspace-switcher">Active location</label>
      <select
        id="workspace-switcher"
        name="workspaceId"
        defaultValue={currentWorkspaceId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="glass-input max-w-[240px] rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {locations.map((location) => (
          <option key={location.workspaceId} value={location.workspaceId}>
            {location.name}{location.city ? ` - ${location.city}` : ""}
          </option>
        ))}
      </select>
    </form>
  );
}

function DashboardBusinessSwitcher({
  business,
  locations,
  currentWorkspaceId,
}: {
  business: string;
  locations: OrganizationWorkspaceSummary[];
  currentWorkspaceId: string;
}) {
  if (locations.length > 1) {
    return (
      <form action={switchWorkspaceAction} className="mt-0.5">
        <label className="sr-only" htmlFor="dashboard-workspace-switcher">Active location</label>
        <select
          id="dashboard-workspace-switcher"
          name="workspaceId"
          defaultValue={currentWorkspaceId}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="max-w-[360px] cursor-pointer bg-transparent pr-2 text-[13px] text-sub focus-visible:outline-none"
        >
          {locations.map((location) => (
            <option key={location.workspaceId} value={location.workspaceId}>
              {location.name}{location.city ? ` - ${location.city}` : ""}
            </option>
          ))}
        </select>
      </form>
    );
  }

  return (
    <Link
      href="/app/settings/locations"
      className="inline-flex items-center gap-1 text-[13px] text-sub transition-colors hover:text-primary-dark"
    >
      {business} <Icon name="chevron-down" size={14} />
    </Link>
  );
}

function DashboardDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 30);
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const range = `${monthDay.format(start)} – ${monthDay.format(end)}, ${end.getFullYear()}`;

  return (
    <div className="glass mr-1 hidden h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium tabular-nums text-ink xl:flex">
      <Icon name="chart" size={15} className="text-faint" />
      {range}
      <Icon name="chevron-down" size={13} className="text-faint" />
    </div>
  );
}

function AccountMenu({
  ownerName,
  ownerEmail,
  showChevron,
}: {
  ownerName: string;
  ownerEmail?: string;
  showChevron?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initials = ownerName.split(" ").map((word) => word[0]).join("").slice(0, 2);

  const close = () => setOpen(false);
  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) close();
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") close();
  };
  const itemClass =
    "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[14px] font-medium text-sub hover:bg-white/80 hover:text-ink";

  return (
    <div ref={rootRef} className="relative" onBlur={onBlur} onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex items-center justify-center rounded-chip text-[13px] font-bold",
          showChevron ? "gap-2 bg-transparent p-1 text-sub" : "size-9 bg-hero text-white",
        )}
      >
        <span className="grid size-9 place-items-center rounded-chip bg-hero text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_6px_rgba(6,45,37,0.35)]">
          {initials}
        </span>
        {showChevron ? <Icon name="chevron-down" size={14} className="hidden sm:block" /> : null}
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="glass-strong absolute right-0 top-full z-30 mt-2 w-64 rounded-[18px] p-1.5 shadow-glass-lg animate-fade-in"
        >
          <div className="px-2.5 pb-2 pt-1.5">
            <div className="truncate text-[14px] font-bold text-ink">{ownerName}</div>
            {ownerEmail ? <div className="truncate text-[13px] text-sub">{ownerEmail}</div> : null}
          </div>
          <div className="mb-1 h-px bg-ink/[.07]" />
          <Link role="menuitem" href="/app/settings" onClick={close} className={itemClass}>
            <Icon name="settings" size={16} /> Settings
          </Link>
          <Link role="menuitem" href="/app/notifications" onClick={close} className={itemClass}>
            <Icon name="bell" size={16} /> Notifications
          </Link>
          <Link role="menuitem" href="/app?tour=1" onClick={close} className={itemClass}>
            <Icon name="compass" size={16} /> Take the tour
          </Link>
          <div className="my-1 h-px bg-ink/[.07]" />
          <form action={signOutAction}>
            <button role="menuitem" className={itemClass}>
              <Icon name="external" size={16} /> Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function Wordmark({ small, inverse }: { small?: boolean; inverse?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-extrabold",
        inverse ? "gap-2.5 text-white" : "gap-2 text-ink",
        small ? "text-[17px]" : "text-[19px]",
      )}
    >
      <FoundlyMark size={small ? 26 : 30} className="shrink-0 drop-shadow-[0_2px_4px_rgba(6,45,37,0.25)]" />
      <span className={inverse ? "text-[17px] tracking-[0.22em]" : "tracking-tight"}>{inverse ? "FOUNDLY" : "Foundly"}</span>
    </span>
  );
}
