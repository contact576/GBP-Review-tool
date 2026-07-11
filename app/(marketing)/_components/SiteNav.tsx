"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { LinkButton } from "@/components/ds/Button";
import { Wordmark } from "@/components/app/AppShell";

const LINKS: { label: string; href: string }[] = [
  { label: "Product", href: "/" },
  { label: "Pricing", href: "/pricing" },
  { label: "Agencies", href: "/agencies" },
  { label: "Resources", href: "/resources" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Foundly home" className="shrink-0">
          <Wordmark />
        </Link>

        {/* Center links — desktop */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className={cn(
                "rounded-btn px-3 py-2 text-[14px] font-medium transition-colors",
                isActive(l.href) ? "text-ink" : "text-sub hover:bg-primary-wash hover:text-ink",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="hidden rounded-btn px-3 py-2 text-[14px] font-semibold text-sub transition-colors hover:text-ink sm:inline-flex"
          >
            Sign in
          </Link>
          <LinkButton href="/sign-up" size="sm">Start free</LinkButton>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="grid size-10 place-items-center rounded-btn text-sub hover:bg-primary-wash md:hidden"
          >
            <Icon name={open ? "x" : "menu"} size={22} />
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {open ? (
        <div className="border-t border-hairline bg-paper px-4 pb-4 pt-2 md:hidden animate-fade-in">
          <nav className="flex flex-col" aria-label="Mobile">
            {LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-btn px-3 py-3 text-[15px] font-medium text-ink hover:bg-primary-wash min-h-[44px]"
              >
                {l.label}
                <Icon name="chevron-right" size={18} className="text-faint" />
              </Link>
            ))}
            <Link
              href="/sign-in"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-btn px-3 py-3 text-[15px] font-medium text-ink hover:bg-primary-wash min-h-[44px]"
            >
              Sign in
              <Icon name="chevron-right" size={18} className="text-faint" />
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
