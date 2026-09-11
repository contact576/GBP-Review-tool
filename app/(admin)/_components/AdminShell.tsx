"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";
import { ToastProvider } from "@/components/ds/Toast";
import { signOutAction } from "@/lib/actions";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Overview", icon: "grid" },
  { href: "/admin/tenants", label: "Tenants", icon: "building" },
  { href: "/admin/billing", label: "Billing", icon: "credit-card" },
  { href: "/admin/delivery", label: "Delivery", icon: "send" },
  { href: "/admin/fraud", label: "Fraud", icon: "shield" },
  { href: "/admin/durability", label: "Durability", icon: "trend" },
  { href: "/admin/flags", label: "Flags", icon: "flag" },
  { href: "/admin/audit", label: "Audit", icon: "lock" },
];

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

export function AdminShell({ children, hasBanner }: { children: React.ReactNode; hasBanner?: boolean }) {
  const pathname = usePathname();

  const NavLink = ({ item, onMobile }: { item: (typeof NAV)[number]; onMobile?: boolean }) => {
    const active = isActive(pathname, item.href);
    return (
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-2.5 rounded-[12px] text-[14px] font-medium transition-colors",
          onMobile ? "shrink-0 px-3 py-2 whitespace-nowrap" : "px-3 py-2",
          active ? "bg-white/[.14] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.12)]" : "text-white/55 hover:bg-white/[.08] hover:text-white",
        )}
      >
        <Icon name={item.icon} size={18} />
        {item.label}
      </Link>
    );
  };

  return (
    <ToastProvider>
      <div className="relative min-h-dvh">
        <div aria-hidden="true" className="ambient-bg" />
        {/* Desktop sidebar — dark internal chrome */}
        <aside className={cn("fixed bottom-3 left-3 z-30 hidden w-[240px] flex-col overflow-hidden rounded-sheet bg-ink/[.88] shadow-[inset_0_1px_0_rgba(255,255,255,.1),0_0_0_1px_rgba(23,32,29,.4),0_24px_60px_-20px_rgba(23,32,29,.6)] backdrop-blur-2xl lg:flex", hasBanner ? "top-[52px]" : "top-3")}>
          <div className="flex items-center justify-between px-4 py-4">
            <OpsMark />
          </div>
          <div className="px-4 pb-3">
            <span className="inline-flex items-center gap-1 rounded-chip bg-danger px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
              <Icon name="lock" size={11} /> Internal
            </span>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-2">
            {NAV.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </nav>
          <div className="border-t border-white/10 p-3">
            <form action={signOutAction}>
              <button className="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-[14px] font-medium text-white/55 hover:bg-white/[.08] hover:text-white">
                <Icon name="external" size={18} /> Sign out
              </button>
            </form>
          </div>
        </aside>

        <div className="relative z-[1] lg:pl-[264px]">
          {/* Header — dark, clearly internal */}
          <header className="sticky top-0 z-20 px-3 pt-3 lg:px-6 xl:px-8">
            <div className="rounded-[20px] bg-ink/[.88] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,.1),0_0_0_1px_rgba(23,32,29,.4),0_12px_32px_-14px_rgba(23,32,29,.5)] backdrop-blur-2xl lg:px-5">
            <div className="flex min-h-[56px] items-center justify-between">
              <div className="flex items-center gap-2 lg:hidden">
                <OpsMark />
              </div>
              <div className="hidden items-center gap-2 lg:flex">
                <span className="text-[13px] text-white/60">Internal · Foundly Ops · never tenant-facing</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-chip bg-danger px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white lg:hidden">
                  <Icon name="lock" size={11} /> Internal
                </span>
                <form action={signOutAction} className="lg:hidden">
                  <button aria-label="Sign out" className="grid size-9 place-items-center rounded-full text-white/60 hover:bg-white/10">
                    <Icon name="external" size={20} />
                  </button>
                </form>
              </div>
            </div>
            <nav className="flex gap-1 overflow-x-auto pb-2 no-scrollbar lg:hidden">
              {NAV.map((item) => (
                <NavLink key={item.href} item={item} onMobile />
              ))}
            </nav>
            </div>
          </header>

          <main id="main" className="px-3 pb-16 pt-5 lg:px-6 lg:pb-12 xl:px-8">
            <div className="mx-auto max-w-[1560px]">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
