"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";
import { Button } from "@/components/ds/Button";

/**
 * First-login product tour.
 *
 * Seven short stops, each spotlighting the navigation item it talks about and
 * saying what the owner does there — with a "go there" link, so the tour is
 * also a launcher. It runs once per workspace per browser (localStorage) and
 * can be replayed from the account menu or the Getting-started card via
 * `/app?tour=1`. Nothing here reads or writes workspace data.
 *
 * Targets are `data-tour` attributes in AppShell. On phones the sidebar is
 * hidden, so a step spotlights its bottom tab when it has one and otherwise
 * shows the card without a spotlight rather than pointing at nothing.
 */

export interface TourStep {
  id: string;
  title: string;
  body: string;
  icon: IconName;
  /** `data-tour` value of the sidebar item (desktop). */
  target: string;
  /** `data-tour` value of the bottom tab (phone), when one exists. */
  mobileTarget?: string;
  href: string;
  cta: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "overview",
    title: "Your dashboard",
    body: "One growth score, your rating and review count from Google, and the three highest-impact moves this week. Every number here is measured, never estimated.",
    icon: "home",
    target: "nav-overview",
    mobileTarget: "tab-overview",
    href: "/app",
    cta: "Stay here",
  },
  {
    id: "customers",
    title: "Customers — the core loop",
    body: "Add a customer and ask for a review in the same breath: pick Email, SMS or WhatsApp right there. Consent is captured first, and every ask lands on your guided review page.",
    icon: "users",
    target: "nav-customers",
    mobileTarget: "tab-customers",
    href: "/app/customers",
    cta: "Add a customer",
  },
  {
    id: "studio",
    title: "Content Studio — QR kit and widget",
    body: "Print the counter card and table tent, download staff QR codes, and copy the website widget. Each scan or click opens the same review page, with the services read from your Google profile and website.",
    icon: "pencil",
    target: "nav-studio",
    href: "/app/studio",
    cta: "Get the QR kit",
  },
  {
    id: "reviews",
    title: "Reviews",
    body: "Every Google review in one inbox with AI-drafted replies you approve before anything is posted. Reviews that vanish from Google are flagged, not silently dropped.",
    icon: "star",
    target: "nav-reviews",
    mobileTarget: "tab-reviews",
    href: "/app/reviews",
    cta: "Open reviews",
  },
  {
    id: "this-week",
    title: "This week",
    body: "Profile improvements found by the audit, each with the exact change previewed. Nothing reaches Google until you approve it, and we read it back afterwards to confirm.",
    icon: "sparkles",
    target: "nav-this-week",
    mobileTarget: "tab-this-week",
    href: "/app/this-week",
    cta: "See this week's moves",
  },
  {
    id: "campaigns",
    title: "Campaigns",
    body: "Promos, win-backs and reminders to customers who opted in to marketing — the audience is filtered by consent before you ever press send, and texts respect quiet hours.",
    icon: "megaphone",
    target: "nav-campaigns",
    href: "/app/campaigns",
    cta: "Plan a campaign",
  },
  {
    id: "settings",
    title: "Settings",
    body: "Your business details, the services customers pick from (read from Google and your website — switch off anything wrong), and the channels invites go out on.",
    icon: "settings",
    target: "nav-settings",
    href: "/app/settings/business",
    cta: "Check settings",
  },
];

export function tourStorageKey(workspaceId: string): string {
  return `foundly.tour.v1:${workspaceId}`;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function measure(selector: string): Rect | null {
  const element = document.querySelector<HTMLElement>(`[data-tour="${selector}"]`);
  if (!element) return null;
  const box = element.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return null;
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

export function ProductTour({ workspaceId, isDemo }: { workspaceId: string; isDemo?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [isPhone, setIsPhone] = useState(false);

  const key = tourStorageKey(workspaceId);
  const requested = searchParams.get("tour") === "1";

  // Decide whether to run: an explicit ?tour=1 always does; otherwise only the
  // very first visit to the dashboard in this browser.
  useEffect(() => {
    if (pathname !== "/app") return;
    let seen = true;
    try {
      seen = window.localStorage.getItem(key) !== null;
    } catch {
      seen = true; // no storage → never auto-start, never nag
    }
    if (requested || (!seen && !isDemo)) {
      setIndex(0);
    }
  }, [pathname, key, requested, isDemo]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const step = index === null ? null : TOUR_STEPS[index] ?? null;

  // Re-measure the spotlight target on step change, resize and scroll.
  useEffect(() => {
    if (!step) return;
    const selector = isPhone ? step.mobileTarget : step.target;
    const update = () => setRect(selector ? measure(selector) : null);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step, isPhone]);

  const finish = useCallback(() => {
    try {
      window.localStorage.setItem(key, new Date().toISOString());
    } catch {
      // Storage unavailable — fine, the tour just won't remember.
    }
    setIndex(null);
    if (requested) router.replace("/app");
  }, [key, requested, router]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight") setIndex((current) => (current === null ? null : Math.min(current + 1, TOUR_STEPS.length - 1)));
      if (event.key === "ArrowLeft") setIndex((current) => (current === null ? null : Math.max(current - 1, 0)));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, finish]);

  const cardStyle = useMemo<React.CSSProperties>(() => {
    if (!rect || typeof window === "undefined") return {};
    const gap = 12;
    const cardWidth = Math.min(360, window.innerWidth - 24);
    if (isPhone) {
      // Bottom tabs: float the card above the tab bar.
      return { left: 12, right: 12, bottom: window.innerHeight - rect.top + gap };
    }
    // Sidebar: to the right of the item, clamped to the viewport.
    const top = Math.max(12, Math.min(rect.top - 8, window.innerHeight - 320));
    return { top, left: Math.min(rect.left + rect.width + gap, window.innerWidth - cardWidth - 12), width: cardWidth };
  }, [rect, isPhone]);

  if (!step || index === null) return null;
  const last = index === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      {/* Dim everything except the target: the hole is the target's rect, the
          dim is one enormous shadow around it. */}
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[10px] ring-2 ring-gold transition-all duration-250"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(23, 32, 29, 0.55)",
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-ink/55" />
      )}
      <button type="button" aria-label="Skip the tour" onClick={finish} className="absolute inset-0 cursor-default" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className={cn(
          "absolute rounded-card border border-hairline bg-card p-4 shadow-lg animate-slide-up",
          !rect && "left-1/2 top-1/2 w-[min(360px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2",
        )}
        style={rect ? cardStyle : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-btn bg-primary text-white">
              <Icon name={step.icon} size={17} />
            </span>
            <div>
              <div className="data-chip text-faint">
                Tour · <span className="tabular-nums">{index + 1}</span>/<span className="tabular-nums">{TOUR_STEPS.length}</span>
              </div>
              <h2 id="tour-title" className="text-[15px] font-extrabold leading-tight text-ink">{step.title}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={finish}
            aria-label="Close tour"
            className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-btn text-sub hover:bg-primary-wash hover:text-ink"
          >
            <Icon name="x" size={15} />
          </button>
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed text-sub">{step.body}</p>

        <div className="mt-3 flex items-center gap-1" aria-hidden>
          {TOUR_STEPS.map((item, i) => (
            <span key={item.id} className={cn("h-1.5 rounded-full transition-all", i === index ? "w-5 bg-primary" : i < index ? "w-2 bg-primary/50" : "w-2 bg-hairline")} />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" iconRight={last ? "check" : "arrow-right"} onClick={() => (last ? finish() : setIndex(index + 1))}>
            {last ? "Finish" : "Next"}
          </Button>
          {index > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setIndex(index - 1)}>
              Back
            </Button>
          ) : null}
          {step.href !== pathname ? (
            <Link
              href={step.href}
              onClick={finish}
              className="ml-auto inline-flex min-h-[36px] items-center gap-1 text-[12px] font-semibold text-primary-dark underline-offset-2 hover:underline"
            >
              {step.cta} <Icon name="chevron-right" size={13} />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
