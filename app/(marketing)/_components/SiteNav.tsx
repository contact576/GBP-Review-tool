"use client";

import { useEffect, useState } from "react";
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

/**
 * The public nav: a floating glass capsule, the same material as the app's
 * chrome. It rides just below the top edge and tightens its shadow once the
 * page scrolls, so the wallpaper stays visible behind it the whole way down.
 */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Route changes close the mobile sheet — otherwise it hangs over the new page.
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4">
      <div
        className={cn(
          "glass-strong mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 rounded-full pl-4 pr-2 transition-shadow duration-300 sm:pl-6 sm:pr-3",
          scrolled && "shadow-halo",
        )}
      >
        <Link href="/" aria-label="Foundly home" className="shrink-0">
          <Wordmark />
        </Link>

        {/* Center links — desktop */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-3.5 py-2 text-[14px] font-semibold transition-colors",
                isActive(l.href)
                  ? "bg-white/70 text-ink shadow-sm"
                  : "text-sub hover:bg-white/45 hover:text-ink",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-1.5">
          <Link
            href="/sign-in"
            className="hidden rounded-full px-3.5 py-2 text-[14px] font-semibold text-sub transition-colors hover:bg-white/45 hover:text-ink sm:inline-flex"
          >
            Sign in
          </Link>
          <LinkButton href="/sign-up" size="sm">Start free</LinkButton>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="grid size-10 place-items-center rounded-full text-sub transition-colors hover:bg-white/45 hover:text-ink md:hidden"
          >
            <Icon name={open ? "x" : "menu"} size={22} />
          </button>
        </div>
      </div>

      {/* Mobile menu sheet — its own floating panel under the capsule */}
      {open ? (
        <div className="glass-strong mx-auto mt-2 max-w-5xl rounded-card p-2 shadow-halo animate-fade-in md:hidden">
          <nav className="flex flex-col" aria-label="Mobile">
            {LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex min-h-[44px] items-center justify-between rounded-btn px-3 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-white/50"
              >
                {l.label}
                <Icon name="chevron-right" size={18} className="text-faint" />
              </Link>
            ))}
            <Link
              href="/sign-in"
              onClick={() => setOpen(false)}
              className="flex min-h-[44px] items-center justify-between rounded-btn px-3 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-white/50"
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
