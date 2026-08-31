import type { Metadata } from "next";
import { ToastProvider } from "@/components/ds";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils/cn";
import { DemoBanner } from "@/components/app/DemoBanner";
import { StaffTabs } from "./StaffTabs";
import { getStaffIdentity } from "./staff-identity";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";

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
  // The chrome names the person who is actually signed in — their roster row
  // when one links to their account, otherwise their own account identity.
  // It never borrows a teammate's name.
  const { session, data, staff, displayName, initials } = await getStaffIdentity();
  const onRoster = staff !== null;
  const firstName = displayName.split(/\s+/)[0] ?? displayName;

  return (
    <>
      {session.isDemo ? <DemoBanner /> : null}
      <ServiceWorkerRegistration />
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
              <span className="text-[13px] font-medium text-sub">{firstName}</span>
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-chip text-[13px] font-bold",
                  onRoster ? "bg-primary-tint text-primary-dark" : "bg-primary-wash text-sub",
                )}
                aria-label={
                  onRoster
                    ? `Signed in as ${displayName}`
                    : `Signed in as ${displayName} — not on the front-desk roster`
                }
              >
                {initials}
              </span>
            </div>
          </header>

          <main id="main" className="flex-1">
            {children}
          </main>

          <StaffTabs />
        </div>
      </ToastProvider>
    </>
  );
}
