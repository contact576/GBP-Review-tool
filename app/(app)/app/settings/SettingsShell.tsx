"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";

/**
 * Docs-style settings shell — a sticky left sub-nav with a green left-edge
 * active indicator alongside a scrolling content column. On narrow screens the
 * nav collapses to a horizontal pill row above the content.
 *
 * Billing is intentionally excluded from this shell (it keeps its own layout);
 * it remains reachable as a nav item here.
 */

const ITEMS: { label: string; href: string; icon: IconName }[] = [
  { label: "Business", href: "/app/settings/business", icon: "building" },
  { label: "Channels", href: "/app/settings/channels", icon: "send" },
  { label: "Consent", href: "/app/settings/consent", icon: "shield" },
  { label: "Team", href: "/app/settings/team", icon: "users" },
  { label: "Billing", href: "/app/settings/billing", icon: "credit-card" },
  { label: "Integrations", href: "/app/settings/integrations", icon: "grid" },
];

export function SettingsShell({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
      {/* Left sub-nav */}
      <aside className="mb-5 lg:mb-0">
        {/* Mobile: horizontal pill row */}
        <nav
          className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 lg:hidden"
          aria-label="Settings sections"
        >
          {ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip px-3.5 py-2 text-[13px] font-semibold transition-colors min-h-[40px]",
                  active ? "bg-ink text-white" : "border border-hairline bg-card text-sub hover:text-ink",
                )}
              >
                <Icon name={item.icon} size={15} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop: sticky vertical nav with green left-edge indicator */}
        <nav
          className="sticky top-6 hidden lg:block"
          aria-label="Settings sections"
        >
          <div className="kicker mb-3 px-3">Settings</div>
          <ul className="space-y-0.5">
            {ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 border-l-2 py-2 pl-3 pr-2 text-[14px] font-semibold transition-colors",
                      active
                        ? "border-primary bg-primary-wash text-ink"
                        : "border-transparent text-sub hover:border-hairline hover:text-ink",
                    )}
                  >
                    <Icon
                      name={item.icon}
                      size={16}
                      className={active ? "text-primary" : "text-faint"}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Content column */}
      <div className="min-w-0">
        <div className="mb-5">
          <h1 className="text-[26px] font-extrabold tracking-tight text-ink lg:text-[30px]">{title}</h1>
          {sub ? <p className="mt-1 text-[15px] text-sub">{sub}</p> : null}
        </div>
        <div className="space-y-5">{children}</div>
      </div>
    </div>
  );
}
