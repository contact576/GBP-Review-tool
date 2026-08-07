"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ds/misc";
import { ToastProvider } from "@/components/ds/Toast";
import { BOTTOM_TABS, MORE_ITEMS, type NavItem } from "./nav";
import { signOutAction, switchWorkspaceAction } from "@/lib/actions";
import type { OrganizationWorkspaceSummary } from "@/lib/data/provider";

const DESKTOP_NAV: NavItem[] = [
  { label: "Overview", href: "/app", icon: "home" },
  { label: "This week", href: "/app/this-week", icon: "sparkles" },
  { label: "Content Studio", href: "/app/studio", icon: "pencil" },
  { label: "Reviews", href: "/app/reviews", icon: "star" },
  { label: "Visibility", href: "/app/visibility", icon: "map-pin" },
  { label: "Campaigns", href: "/app/campaigns", icon: "megaphone" },
  { label: "Customers", href: "/app/customers", icon: "users" },
  { label: "Analytics", href: "/app/analytics", icon: "chart" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({
  children,
  business,
  ownerName,
  ownerEmail,
  trialDaysLeft,
  unread,
  locations,
  currentWorkspaceId,
  agencyMode,
  isDemo,
}: {
  children: React.ReactNode;
  business: string;
  ownerName: string;
  ownerEmail?: string;
  trialDaysLeft?: number;
  unread?: number;
  locations: OrganizationWorkspaceSummary[];
  currentWorkspaceId: string;
  agencyMode?: boolean;
  isDemo?: boolean;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const dashboardHome = pathname === "/app";

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-paper">
        <aside
          className={cn(
            "on-hero fixed bottom-0 left-0 z-30 hidden w-[248px] flex-col overflow-hidden bg-hero text-white shadow-[10px_0_35px_rgba(6,45,37,.08)] lg:flex",
            isDemo ? "top-10" : "top-0",
          )}
        >
          <div className="flex h-[88px] items-center px-7">
            <Wordmark inverse />
          </div>

          <nav className="flex-1 overflow-y-auto px-4 py-2" aria-label="Main navigation">
            {DESKTOP_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative mb-1 flex min-h-11 items-center gap-3 rounded-[9px] px-4 text-[14px] font-semibold transition-colors",
                    active
                      ? "bg-white/[.085] text-white"
                      : "text-white/65 hover:bg-white/[.055] hover:text-white",
                  )}
                >
                  {active ? <span className="absolute -left-4 h-7 w-0.5 rounded-r-full bg-gold" /> : null}
                  <Icon name={item.icon} size={18} className={active ? "text-gold" : "text-white/70"} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="px-4 pb-4">
            <Link
              href="/app/milestones"
              className="block rounded-[12px] border border-white/10 bg-white/[.065] p-4 transition-colors hover:bg-white/[.095]"
            >
              <span className="mb-3 grid size-8 place-items-center rounded-full bg-gold/15 text-gold">
                <Icon name="sparkles" size={16} />
              </span>
              <span className="block text-[13px] font-bold leading-snug text-white">Refer a business. Grow together.</span>
              <span className="mt-1.5 block text-[11px] leading-relaxed text-white/55">
                Give another local business a stronger start and earn account credit.
              </span>
              <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-gold">
                Invite now <Icon name="arrow-right" size={13} />
              </span>
            </Link>
          </div>

          <div className="border-t border-white/10 p-3">
            {agencyMode ? (
              <Link
                href="/agency"
                className="mb-1 flex items-center gap-2.5 rounded-btn bg-white/[.07] px-3 py-2 text-[13px] font-semibold text-white"
              >
                <Icon name="grid" size={18} /> Agency console
              </Link>
            ) : null}
            <Link
              href="/app/settings/business"
              className={cn(
                "flex items-center gap-2.5 rounded-btn px-3 py-2 text-[13px] font-medium",
                pathname.startsWith("/app/settings")
                  ? "bg-white/[.09] text-white"
                  : "text-white/60 hover:bg-white/[.055] hover:text-white",
              )}
            >
              <Icon name="settings" size={18} /> Settings
            </Link>
            <form action={signOutAction}>
              <button className="flex w-full items-center gap-2.5 rounded-btn px-3 py-2 text-[13px] font-medium text-white/60 hover:bg-white/[.055] hover:text-white">
                <Icon name="external" size={18} /> Sign out
              </button>
            </form>
          </div>
        </aside>

        <div className="lg:pl-[248px]">
          <header
            className={cn(
              "z-20 flex items-center justify-between px-4 py-3",
              dashboardHome
                ? "sticky top-0 bg-paper/94 backdrop-blur lg:relative lg:bg-paper lg:px-8 lg:pb-3 lg:pt-6"
                : "sticky top-0 border-b border-hairline bg-paper/90 backdrop-blur lg:px-8",
            )}
          >
            <div className="flex items-center gap-2 lg:hidden">
              <Wordmark small />
            </div>

            {dashboardHome ? (
              <div className="hidden min-w-0 lg:block">
                <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.025em] text-ink">
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

            <div className="flex items-center gap-2">
              {dashboardHome ? <DashboardDateRange /> : null}
              {!dashboardHome && agencyMode ? (
                <Link href="/agency" className="hidden sm:inline-flex">
                  <Badge tone="primary" icon="grid">Agency</Badge>
                </Link>
              ) : null}
              {!dashboardHome && typeof trialDaysLeft === "number" && trialDaysLeft > 0 ? (
                <Link href="/app/settings/billing" className="hidden sm:inline-flex">
                  <Badge tone="gold" icon="clock">Trial · {trialDaysLeft}d left</Badge>
                </Link>
              ) : null}
              <Link
                href="/app/notifications"
                aria-label="Notifications"
                className="relative grid size-10 place-items-center rounded-full text-sub hover:bg-card hover:text-ink hover:shadow-sm"
              >
                <Icon name="bell" size={20} />
                {unread ? (
                  dashboardHome ? (
                    <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-gold px-1 text-[9px] font-extrabold leading-4 text-ink">
                      {unread}
                    </span>
                  ) : (
                    <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger" />
                  )
                ) : null}
              </Link>
              <AccountMenu ownerName={ownerName} ownerEmail={ownerEmail} showChevron={dashboardHome} />
            </div>
          </header>

          <main
            id="main"
            className={cn(
              "px-4 pb-24 pt-5 lg:pb-12",
              dashboardHome ? "lg:px-7 lg:pt-2 xl:px-8" : "lg:px-8 lg:pt-7 xl:px-10",
            )}
          >
            <div className={cn("mx-auto", dashboardHome ? "max-w-[1500px]" : "max-w-[1400px]")}>{children}</div>
          </main>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline bg-card lg:hidden">
          {BOTTOM_TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium",
                isActive(pathname, tab.href) ? "text-primary" : "text-faint",
              )}
            >
              <Icon name={tab.icon} size={22} />
              {tab.label}
            </Link>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium text-faint"
          >
            <Icon name="more" size={22} />
            More
          </button>
        </nav>

        {moreOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-ink/30 animate-fade-in" onClick={() => setMoreOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 rounded-t-card bg-card p-4 pb-8 animate-slide-up">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-hairline" />
              <div className="grid grid-cols-3 gap-2">
                {MORE_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-1.5 rounded-card border border-hairline p-3 text-center"
                  >
                    <Icon name={item.icon} size={20} className="text-primary" />
                    <span className="text-[12px] font-medium leading-tight text-ink">{item.label}</span>
                  </Link>
                ))}
              </div>
              <form action={signOutAction} className="mt-3">
                <button className="w-full rounded-btn border border-hairline py-3 text-[14px] font-semibold text-sub">Sign out</button>
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
        <span className="grid size-7 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
          <Icon name="map-pin" size={15} />
        </span>
        <span className="truncate text-[14px] font-semibold text-ink">{business}</span>
      </div>
    );
  }

  return (
    <form action={switchWorkspaceAction} className="hidden min-w-0 items-center gap-2 sm:flex">
      <span className="grid size-7 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
        <Icon name="building" size={15} />
      </span>
      <label className="sr-only" htmlFor="workspace-switcher">Active location</label>
      <select
        id="workspace-switcher"
        name="workspaceId"
        defaultValue={currentWorkspaceId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="max-w-[240px] rounded-btn border border-hairline bg-card px-2.5 py-1.5 text-[13px] font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
      <form action={switchWorkspaceAction} className="mt-1.5">
        <label className="sr-only" htmlFor="dashboard-workspace-switcher">Active location</label>
        <select
          id="dashboard-workspace-switcher"
          name="workspaceId"
          defaultValue={currentWorkspaceId}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="max-w-[360px] cursor-pointer bg-transparent pr-2 text-[13px] font-semibold text-sub focus-visible:outline-none"
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
      className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-sub hover:text-primary-dark"
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
    <div className="mr-1 hidden items-center gap-2 rounded-[9px] border border-hairline bg-card px-3 py-2 text-[12px] font-semibold text-sub shadow-sm sm:flex">
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
    "flex w-full items-center gap-2.5 rounded-btn px-2.5 py-2 text-[14px] font-medium text-sub hover:bg-primary-wash hover:text-ink";

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
        <span className="grid size-9 place-items-center rounded-chip bg-hero text-white">{initials}</span>
        {showChevron ? <Icon name="chevron-down" size={14} className="hidden sm:block" /> : null}
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-30 mt-2 w-64 rounded-card border border-hairline bg-card p-1.5 shadow-lg animate-fade-in"
        >
          <div className="px-2.5 pb-2 pt-1.5">
            <div className="truncate text-[14px] font-bold text-ink">{ownerName}</div>
            {ownerEmail ? <div className="truncate text-[13px] text-sub">{ownerEmail}</div> : null}
          </div>
          <div className="mb-1 h-px bg-hairline" />
          <Link role="menuitem" href="/app/settings" onClick={close} className={itemClass}>
            <Icon name="settings" size={16} /> Settings
          </Link>
          <Link role="menuitem" href="/app/notifications" onClick={close} className={itemClass}>
            <Icon name="bell" size={16} /> Notifications
          </Link>
          <div className="my-1 h-px bg-hairline" />
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
        inverse ? "gap-2.5 text-white" : "gap-1.5 text-ink",
        small ? "text-[17px]" : "text-[19px]",
      )}
    >
      <span className={cn("relative grid size-7 place-items-center", inverse ? "text-gold" : "rounded-btn bg-hero text-white")}>
        <Icon name={inverse ? "leaf" : "sparkles"} size={inverse ? 23 : 16} className="text-gold" />
      </span>
      <span className={inverse ? "text-[17px] tracking-[0.22em]" : ""}>{inverse ? "FOUNDLY" : "Foundly"}</span>
    </span>
  );
}
