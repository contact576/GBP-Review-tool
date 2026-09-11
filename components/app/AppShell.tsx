"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { trialLockAllowsPath } from "@/lib/billing/trial";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ds/misc";
import { ToastProvider } from "@/components/ds/Toast";
import { ProductTour } from "./ProductTour";
import { BOTTOM_TABS, MORE_ITEMS, type NavItem } from "./nav";
import { signOutAction, switchWorkspaceAction } from "@/lib/actions";
import type { OrganizationWorkspaceSummary } from "@/lib/data/provider";

const DESKTOP_NAV: (NavItem & { tour: string })[] = [
  { label: "Overview", href: "/app", icon: "home", tour: "nav-overview" },
  { label: "This week", href: "/app/this-week", icon: "sparkles", tour: "nav-this-week" },
  { label: "Content Studio", href: "/app/studio", icon: "pencil", tour: "nav-studio" },
  { label: "Reviews", href: "/app/reviews", icon: "star", tour: "nav-reviews" },
  { label: "Visibility", href: "/app/visibility", icon: "map-pin", tour: "nav-visibility" },
  { label: "Campaigns", href: "/app/campaigns", icon: "megaphone", tour: "nav-campaigns" },
  { label: "Customers", href: "/app/customers", icon: "users", tour: "nav-customers" },
  { label: "Analytics", href: "/app/analytics", icon: "chart", tour: "nav-analytics" },
];

/** Bottom-tab `data-tour` ids, keyed by href, so the phone tour can spotlight them. */
const TAB_TOUR: Record<string, string> = {
  "/app": "tab-overview",
  "/app/this-week": "tab-this-week",
  "/app/reviews": "tab-reviews",
  "/app/customers": "tab-customers",
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Owner console chrome — the glass edition.
 *
 * Everything that frames the page is a floating frosted-glass panel inset from
 * the viewport edge (sidebar, header bar, phone tab bar) over a fixed ambient
 * canvas, so the content scrolls *under* the chrome and shows through it.
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
      "relative flex min-h-10 items-center gap-3 rounded-[12px] px-3 text-[14px] font-medium transition-[background-color,color,box-shadow] duration-150",
      active
        ? "bg-white/85 text-primary-dark shadow-[0_1px_2px_rgba(23,32,29,0.08),0_0_0_1px_rgba(23,32,29,0.05)]"
        : "text-sub hover:bg-white/45 hover:text-ink",
    );

  return (
    <ToastProvider>
      {/* useSearchParams needs a Suspense boundary; the tour renders nothing until it runs. */}
      <Suspense fallback={null}>
        <ProductTour workspaceId={currentWorkspaceId} isDemo={isDemo} />
      </Suspense>
      <div className="relative min-h-dvh">
        <div aria-hidden="true" className="ambient-bg" />

        {/* ── Desktop sidebar: a floating glass panel ─────────── */}
        <aside
          className={cn(
            "glass-strong fixed bottom-3 left-3 z-30 hidden w-[240px] flex-col overflow-hidden rounded-sheet lg:flex",
            hasBanner || isDemo ? "top-[52px]" : "top-3",
          )}
        >
          <div className="flex h-[76px] items-center px-6">
            <Wordmark />
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1" aria-label="Main navigation">
            {DESKTOP_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link key={item.href} href={item.href} data-tour={item.tour} className={navLink(active)}>
                  <Icon name={item.icon} size={18} className={active ? "text-primary" : "text-faint"} />
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
                <Icon name="grid" size={17} className="text-primary" /> Agency console
              </Link>
            ) : null}
            <Link
              href="/app/settings/business"
              data-tour="nav-settings"
              className={cn(navLink(pathname.startsWith("/app/settings")), "min-h-9 text-[13px]")}
            >
              <Icon name="settings" size={17} className={pathname.startsWith("/app/settings") ? "text-primary" : "text-faint"} /> Settings
            </Link>
            <form action={signOutAction}>
              <button className={cn(navLink(false), "min-h-9 w-full text-[13px]")}>
                <Icon name="external" size={17} className="text-faint" /> Sign out
              </button>
            </form>
          </div>
        </aside>

        <div className="relative z-[1] lg:pl-[264px]">
          {/* ── Floating header bar ─────────────────────────── */}
          <header className="sticky top-0 z-20 px-3 pt-3 lg:px-6 lg:pt-3 xl:px-8">
            <div className="glass-strong flex min-h-[60px] items-center justify-between gap-3 rounded-[20px] px-3 lg:px-5">
              <div className="flex items-center gap-2 lg:hidden">
                <Wordmark small />
              </div>

              {dashboardHome ? (
                <div className="hidden min-w-0 lg:block">
                  <h1 className="text-[20px] font-bold leading-tight tracking-tight text-ink">
                    Good morning, {ownerName.split(" ")[0]}
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

          <main
            id="main"
            className={cn(
              "px-3 pb-32 pt-5 lg:px-6 lg:pb-12 lg:pt-6 xl:px-8",
            )}
          >
            <div className={cn("mx-auto", dashboardHome ? "max-w-[1500px]" : "max-w-[1400px]")}>{children}</div>
          </main>
        </div>

        {/* ── Phone tab bar: a floating glass capsule ──────────── */}
        <nav
          className="glass-strong fixed inset-x-3 bottom-3 z-30 flex rounded-full p-1 lg:hidden"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
          aria-label="Primary"
        >
          {BOTTOM_TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                data-tour={TAB_TOUR[tab.href]}
                className={cn(
                  "flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium transition-colors",
                  active ? "bg-white/85 text-primary-dark shadow-[0_1px_2px_rgba(23,32,29,0.08)]" : "text-sub",
                )}
              >
                <Icon name={tab.icon} size={22} className={active ? "text-primary" : undefined} />
                {tab.label}
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium text-sub"
          >
            <Icon name="more" size={22} />
            More
          </button>
        </nav>

        {moreOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-ink/25 backdrop-blur-[2px] animate-fade-in" onClick={() => setMoreOpen(false)} />
            <div className="glass-strong absolute inset-x-2 bottom-2 rounded-sheet p-4 pb-6 animate-slide-up">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15" />
              <div className="grid grid-cols-3 gap-2">
                {MORE_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-1.5 rounded-[16px] bg-white/60 p-3 text-center shadow-[0_0_0_1px_rgba(23,32,29,0.05)]"
                  >
                    <Icon name={item.icon} size={20} className="text-primary" />
                    <span className="text-[12px] font-medium leading-tight text-ink">{item.label}</span>
                  </Link>
                ))}
              </div>
              <form action={signOutAction} className="mt-3">
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
    <div className="glass mr-1 hidden h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium tabular-nums text-ink sm:flex">
      <Icon name="clock" size={15} className="text-faint" />
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
      <span
        className={cn(
          "relative grid place-items-center",
          inverse
            ? "size-7 text-gold"
            : "size-8 rounded-[10px] bg-hero text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_2px_6px_rgba(6,45,37,0.35)]",
        )}
      >
        <Icon name={inverse ? "leaf" : "sparkles"} size={inverse ? 23 : 16} className="text-gold" />
      </span>
      <span className={inverse ? "text-[17px] tracking-[0.22em]" : "tracking-tight"}>{inverse ? "FOUNDLY" : "Foundly"}</span>
    </span>
  );
}
