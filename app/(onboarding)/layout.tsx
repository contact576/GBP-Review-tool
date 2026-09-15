import Link from "next/link";
import { Wordmark } from "@/components/app/AppShell";
import { Wallpaper } from "@/components/app/desktop/Wallpaper";

/**
 * Full-screen wizard chrome for the onboarding flow. Gated by middleware —
 * the visitor already has a session (set at sign-up). The desktop wallpaper
 * with a slim floating top bar and a centered, thumb-reachable column.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <Wallpaper />
      <header className="sticky top-0 z-20 px-3 pt-3">
        <div className="glass-strong flex min-h-[56px] items-center justify-between rounded-[18px] px-4">
        <Wordmark small />
        <Link
          href="/app"
          className="inline-flex min-h-[36px] items-center rounded-btn px-2 text-[13px] font-medium text-sub hover:text-ink"
        >
          Do this later
        </Link>
      </div>
      </header>
      <main id="main" className="relative z-[1] mx-auto w-full max-w-md px-4">
        {children}
      </main>
    </div>
  );
}
