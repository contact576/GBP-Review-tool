import Link from "next/link";
import { Wordmark } from "@/components/app/AppShell";

/**
 * Full-screen wizard chrome for the onboarding flow. Gated by middleware —
 * the visitor already has a session (set at sign-up). Warm-paper canvas with a
 * slim top bar and a centered, thumb-reachable column.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-hairline bg-paper px-4 py-3">
        <Wordmark small />
        <Link
          href="/app"
          className="inline-flex min-h-[36px] items-center rounded-btn px-2 text-[13px] font-medium text-sub hover:text-ink"
        >
          Do this later
        </Link>
      </header>
      <main id="main" className="mx-auto w-full max-w-md px-4">
        {children}
      </main>
    </div>
  );
}
