"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";

const ITEMS: { label: string; href: string; icon: IconName }[] = [
  { label: "Business", href: "/app/settings/business", icon: "building" },
  { label: "Locations", href: "/app/settings/locations", icon: "map-pin" },
  { label: "Channels", href: "/app/settings/channels", icon: "send" },
  { label: "Consent", href: "/app/settings/consent", icon: "shield" },
  { label: "Team", href: "/app/settings/team", icon: "users" },
  { label: "Billing", href: "/app/settings/billing", icon: "credit-card" },
  { label: "Integrations", href: "/app/settings/integrations", icon: "grid" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1" aria-label="Settings sections">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip px-3.5 py-2 text-[13px] font-semibold transition-colors min-h-[40px]",
              active ? "bg-ink text-white" : "bg-card text-sub border border-hairline hover:text-ink",
            )}
          >
            <Icon name={item.icon} size={15} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
