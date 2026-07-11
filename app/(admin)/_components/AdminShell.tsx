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

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const NavLink = ({ item, onMobile }: { item: (typeof NAV)[number]; onMobile?: boolean }) => {
    const active = isActive(pathname, item.href);
    return (
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-2.5 rounded-btn text-[14px] font-medium transition-colors",
          onMobile ? "shrink-0 px-3 py-2 whitespace-nowrap" : "px-2.5 py-2",
          active ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/10 hover:text-white",
        )}
      >
        <Icon name={item.icon} size={18} />
        {item.label}
      </Link>
    );
  };

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-paper">
        {/* Desktop sidebar — dark internal chrome */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-ink lg:flex">
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
              <button className="flex w-full items-center gap-2.5 rounded-btn px-2.5 py-2 text-[14px] font-medium text-white/55 hover:bg-white/10 hover:text-white">
                <Icon name="external" size={18} /> Sign out
              </button>
            </form>
          </div>
        </aside>

        <div className="lg:pl-60">
          {/* Header — dark, clearly internal */}
          <header className="sticky top-0 z-20 border-b border-white/10 bg-ink">
            <div className="flex items-center justify-between px-4 py-3 lg:px-8">
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
                  <button aria-label="Sign out" className="grid size-9 place-items-center rounded-btn text-white/60 hover:bg-white/10">
                    <Icon name="external" size={20} />
                  </button>
                </form>
              </div>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-3 pb-2 no-scrollbar lg:hidden">
              {NAV.map((item) => (
                <NavLink key={item.href} item={item} onMobile />
              ))}
            </nav>
          </header>

          <main id="main" className="px-4 pb-16 pt-5 lg:px-8 lg:pb-12">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
