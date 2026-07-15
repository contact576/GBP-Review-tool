"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";
import { ToastProvider } from "@/components/ds/Toast";
import { readableText } from "@/lib/theme/contrast";
import { signOutAction } from "@/lib/actions";
import { hexTint } from "./brand";

export interface AgencyBrand {
  brandName: string;
  primary: string;
  accent: string;
  logoText: string;
}

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/agency", label: "Clients", icon: "grid" },
  { href: "/agency/clients", label: "Client book", icon: "users" },
  { href: "/agency/white-label", label: "White-label", icon: "sparkles" },
  { href: "/agency/reports", label: "Reports", icon: "file" },
  { href: "/agency/economics", label: "Economics", icon: "credit-card" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/agency") return pathname === "/agency";
  return pathname === href || pathname.startsWith(href + "/");
}

function BrandMark({ brand, small }: { brand: AgencyBrand; small?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-extrabold text-ink", small ? "text-[16px]" : "text-[18px]")}>
      <span
        className={cn("grid place-items-center rounded-btn font-black", small ? "size-7 text-[13px]" : "size-8 text-[15px]")}
        style={{ backgroundColor: brand.primary, color: readableText(brand.primary) }}
      >
        {brand.logoText.slice(0, 1).toUpperCase()}
      </span>
      <span className="truncate">{brand.brandName}</span>
    </span>
  );
}

export function AgencyShell({ brand, children }: { brand: AgencyBrand; children: React.ReactNode }) {
  const pathname = usePathname();

  const NavLink = ({ item, onMobile }: { item: (typeof NAV)[number]; onMobile?: boolean }) => {
    const active = isActive(pathname, item.href);
    return (
      <Link
        href={item.href}
        style={active ? { backgroundColor: hexTint(brand.primary, 0.12), color: brand.primary } : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-btn text-[14px] font-medium transition-colors",
          onMobile ? "shrink-0 px-3 py-2 whitespace-nowrap" : "px-2.5 py-2",
          !active && "text-sub hover:bg-primary-wash hover:text-ink",
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
        {/* Desktop sidebar — the agency's own brand, not Foundly */}
        <aside
          className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-hairline bg-card lg:flex"
          style={{ borderTop: `3px solid ${brand.primary}` }}
        >
          <div className="px-5 py-4">
            <BrandMark brand={brand} />
            <div className="kicker mt-1 text-faint">Growth control plane</div>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-2">
            <div className="kicker px-2 pb-1">Manage</div>
            {NAV.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </nav>
          <div className="border-t border-hairline p-3">
            <form action={signOutAction}>
              <button className="flex w-full items-center gap-2.5 rounded-btn px-2.5 py-2 text-[14px] font-medium text-sub hover:bg-primary-wash">
                <Icon name="external" size={18} /> Sign out
              </button>
            </form>
          </div>
        </aside>

        <div className="lg:pl-60">
          {/* Mobile top bar + horizontal nav */}
          <header
            className="sticky top-0 z-20 border-b border-hairline bg-paper/90 backdrop-blur lg:px-8"
            style={{ borderTop: `3px solid ${brand.primary}` }}
          >
            <div className="flex items-center justify-between px-4 py-3 lg:px-0">
              <div className="lg:hidden">
                <BrandMark brand={brand} small />
              </div>
              <div className="hidden text-[13px] text-sub lg:block">Agency console · {brand.brandName}</div>
              <form action={signOutAction} className="lg:hidden">
                <button aria-label="Sign out" className="grid size-9 place-items-center rounded-btn text-sub hover:bg-primary-wash">
                  <Icon name="external" size={20} />
                </button>
              </form>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-3 pb-2 no-scrollbar lg:hidden">
              {NAV.map((item) => (
                <NavLink key={item.href} item={item} onMobile />
              ))}
            </nav>
          </header>

          <main id="main" className="px-4 pb-16 pt-5 lg:px-8 lg:pb-12">
            <div className="mx-auto max-w-[1560px]">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
