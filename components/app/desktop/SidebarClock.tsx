"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * The clock widget on the side: a small analog face beside the digital time
 * and today's date, in the sidebar under the wordmark — the desktop-widget
 * touch the console is built around. The face is drawn from the real time
 * (hour, minute and a thin second hand), so it is a reading, not an
 * animation; under reduced motion it still updates, it just does not sweep.
 * Rendered after mount so server and client markup never disagree.
 */
export function SidebarClock({ className, inverse }: { className?: string; inverse?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const interval = setInterval(tick, 1_000);
    return () => clearInterval(interval);
  }, []);

  const hours = now ? now.getHours() % 12 : 10;
  const minutes = now ? now.getMinutes() : 10;
  const seconds = now ? now.getSeconds() : 0;
  const hourAngle = hours * 30 + minutes * 0.5;
  const minuteAngle = minutes * 6 + seconds * 0.1;
  const secondAngle = seconds * 6;

  const time = now ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(now) : "";
  const weekday = now ? new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(now) : "";
  const date = now ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(now) : "";

  return (
    <div
      className={cn("flex items-center gap-3 rounded-[18px] px-3 py-2.5", inverse ? "" : "glass", className)}
      role="group"
      aria-label={now ? `It is ${time}, ${weekday} ${date}` : "Clock"}
    >
      <div className="clock-face" aria-hidden="true">
        <svg viewBox="0 0 52 52" width={52} height={52} className="absolute inset-0">
          {/* Hour ticks */}
          {Array.from({ length: 12 }, (_, i) => (
            <line
              key={i}
              x1="26"
              y1="5"
              x2="26"
              y2={i % 3 === 0 ? "9" : "7.2"}
              stroke="rgba(23,32,29,0.55)"
              strokeWidth={i % 3 === 0 ? 1.6 : 1}
              strokeLinecap="round"
              transform={`rotate(${i * 30} 26 26)`}
            />
          ))}
          {now ? (
            <>
              <line x1="26" y1="27.5" x2="26" y2="14.5" stroke="#17201D" strokeWidth="2.6" strokeLinecap="round" transform={`rotate(${hourAngle} 26 26)`} />
              <line x1="26" y1="28" x2="26" y2="9.5" stroke="#17201D" strokeWidth="1.9" strokeLinecap="round" transform={`rotate(${minuteAngle} 26 26)`} />
              <line x1="26" y1="30" x2="26" y2="8" stroke="#E8A33D" strokeWidth="1" strokeLinecap="round" transform={`rotate(${secondAngle} 26 26)`} />
              <circle cx="26" cy="26" r="1.9" fill="#17201D" />
              <circle cx="26" cy="26" r="0.8" fill="#E8A33D" />
            </>
          ) : null}
        </svg>
      </div>
      <div className="min-w-0 leading-tight" suppressHydrationWarning>
        <div className={cn("display-num text-[22px]", inverse ? "text-white" : "text-ink")}>{time || " "}</div>
        <div className={cn("truncate text-[12px] font-medium", inverse ? "text-white/60" : "text-sub")}>
          {now ? `${weekday}, ${date}` : " "}
        </div>
      </div>
    </div>
  );
}
