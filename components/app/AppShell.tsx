"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ds/misc";
import { ToastProvider } from "@/components/ds/Toast";
import { NAV_GROUPS, BOTTOM_TABS, MORE_ITEMS } from "./nav";
import { signOutAction } from "@/lib/actions";

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
}: {
  children: React.ReactNode;
  business: string;
  ownerName: string;
  ownerEmail?: string;
  trialDaysLeft?: number;
  unread?: number;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-paper">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-hairline bg-card lg:flex">
          <div className="flex items-center gap-2 px-5 py-4">
            <Wordmark />
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-2">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="mb-4">
                <div className="kicker px-2 pb-1">{group.label}</div>
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-btn px-2.5 py-2 text-[14px] font-medium transition-colors",
                      isActive(pathname, item.href)
                        ? "bg-primary-tint text-primary-dark"
                        : "text-sub hover:bg-primary-wash hover:text-ink",
                    )}
                  >
                    <Icon name={item.icon} size={18} />
                    {item.label}
                    {item.pro ? <Badge tone="gold" className="ml-auto">Pro</Badge> : null}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className="border-t border-hairline p-3">
            <Link
              href="/app/settings/business"
              className={cn(
                "flex items-center gap-2.5 rounded-btn px-2.5 py-2 text-[14px] font-medium",
                pathname.startsWith("/app/settings") ? "bg-primary-tint text-primary-dark" : "text-sub hover:bg-primary-wash",
              )}
            >
              <Icon name="settings" size={18} /> Settings
            </Link>
            <form action={signOutAction}>
              <button className="flex w-full items-center gap-2.5 rounded-btn px-2.5 py-2 text-[14px] font-medium text-sub hover:bg-primary-wash">
                <Icon name="external" size={18} /> Sign out
              </button>
            </form>
          </div>
        </aside>

        {/* Main column */}
        <div className="lg:pl-60">
          {/* Top bar */}
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-hairline bg-paper/90 px-4 py-3 backdrop-blur lg:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <Wordmark small />
            </div>
            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              <span className="grid size-7 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
                <Icon name="map-pin" size={15} />
              </span>
              <span className="truncate text-[14px] font-semibold text-ink">{business}</span>
            </div>
            <div className="flex items-center gap-2">
              {typeof trialDaysLeft === "number" && trialDaysLeft > 0 ? (
                <Link href="/app/settings/billing" className="hidden sm:inline-flex">
                  <Badge tone="gold" icon="clock">Trial · {trialDaysLeft}d left</Badge>
                </Link>
              ) : null}
              <Link href="/app/notifications" aria-label="Notifications" className="relative grid size-9 place-items-center rounded-btn text-sub hover:bg-primary-wash">
                <Icon name="bell" size={20} />
                {unread ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger" /> : null}
              </Link>
              <AccountMenu ownerName={ownerName} ownerEmail={ownerEmail} />
            </div>
          </header>

          <main id="main" className="px-4 pb-24 pt-5 lg:px-8 lg:pb-12 lg:pt-7 xl:px-10">
            <div className="mx-auto max-w-[1400px]">{children}</div>
          </main>
        </div>

        {/* Mobile bottom tabs */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline bg-card lg:hidden">
          {BOTTOM_TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium min-h-[56px] justify-center",
                isActive(pathname, tab.href) ? "text-primary" : "text-faint",
              )}
            >
              <Icon name={tab.icon} size={22} />
              {tab.label}
            </Link>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-faint min-h-[56px] justify-center"
          >
            <Icon name="more" size={22} />
            More
          </button>
        </nav>

        {/* More sheet */}
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
                    <span className="text-[12px] font-medium text-ink leading-tight">{item.label}</span>
                    {item.pro ? <Badge tone="gold">Pro</Badge> : null}
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

/** Accessible account dropdown — button + menu, closes on Esc, blur, or item click. */
function AccountMenu({ ownerName, ownerEmail }: { ownerName: string; ownerEmail?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initials = ownerName.split(" ").map((w) => w[0]).join("").slice(0, 2);

  const close = () => setOpen(false);
  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!rootRef.current?.contains(e.relatedTarget as Node | null)) close();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") close();
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
        onClick={() => setOpen((v) => !v)}
        className="grid size-9 place-items-center rounded-chip bg-hero text-[13px] font-bold text-white"
      >
        {initials}
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

export function Wordmark({ small }: { small?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-extrabold text-ink", small ? "text-[17px]" : "text-[19px]")}>
      <span className="relative grid size-7 place-items-center rounded-btn bg-hero text-white">
        <Icon name="sparkles" size={16} className="text-gold" />
      </span>
      Foundly
    </span>
  );
}
