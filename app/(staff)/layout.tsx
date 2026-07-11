import type { Metadata } from "next";
import { getData } from "@/lib/data";
import { ToastProvider } from "@/components/ds";
import { Icon } from "@/components/icons";
import { StaffTabs } from "./StaffTabs";

export const metadata: Metadata = {
  title: "Front desk",
  description: "Capture a happy customer in about ten seconds.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Foundly",
  },
};

/**
 * Staff PWA chrome — token/role scoped, NOT session-gated (middleware skips /staff).
 * Full-screen, one-handed, warm-paper. No owner nav: a slim top bar + a 3-tab row.
 */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const data = await getData();
  const priya = data.staff.find((s) => s.id === "stf_priya") ?? data.staff[0];
  const staffName = priya?.displayName ?? "Front desk";
  const staffInitials = priya?.avatarInitials ?? "FD";

  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col bg-paper">
        {/* Slim top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-hairline bg-paper/90 px-4 py-2.5 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-btn bg-hero text-white">
              <Icon name="sparkles" size={16} className="text-gold" />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="kicker">Front desk</div>
              <div className="truncate text-[14px] font-bold text-ink">{data.location.name}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[13px] font-medium text-sub">{staffName.split(" ")[0]}</span>
            <span
              className="grid size-9 place-items-center rounded-chip bg-primary-tint text-[13px] font-bold text-primary-dark"
              aria-label={`Signed in as ${staffName}`}
            >
              {staffInitials}
            </span>
          </div>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>

        <StaffTabs />
      </div>
    </ToastProvider>
  );
}
