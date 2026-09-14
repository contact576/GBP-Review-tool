"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";

/**
 * The menu-bar clock: weekday, date and a live time at the right end of the
 * floating header, the way the macOS menu bar carries one. Ticks once a
 * minute (seconds are not shown, so nothing re-renders more often than it
 * needs to). Rendered only after mount so server and client markup never
 * disagree about the time. `inverse` is for the ops console's ink chrome.
 */
export function MenuBarClock({
  className,
  showDate = true,
  inverse = false,
}: {
  className?: string;
  showDate?: boolean;
  inverse?: boolean;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    // Align the first interval to the top of the next minute.
    const delay = 60_000 - (Date.now() % 60_000);
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      tick();
      interval = setInterval(tick, 60_000);
    }, delay);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  const date = now ? new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(now) : "";
  const time = now ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(now) : "";

  return (
    <time
      dateTime={now?.toISOString()}
      className={cn(
        "menubar-clock",
        inverse ? "bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" : "glass",
        className,
      )}
      aria-live="off"
      suppressHydrationWarning
    >
      <Icon name="clock" size={15} className={inverse ? "text-white/60" : "text-faint"} />
      {now ? (
        <>
          {showDate ? (
            <>
              <span className="hidden md:inline">{date}</span>
              <span className={cn("sep hidden md:inline", inverse && "text-white/40")}>·</span>
            </>
          ) : null}
          <span>{time}</span>
        </>
      ) : (
        <span className="inline-block w-[64px]" aria-hidden="true">&nbsp;</span>
      )}
    </time>
  );
}
