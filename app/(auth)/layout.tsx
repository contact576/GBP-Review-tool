import Link from "next/link";
import { Wordmark } from "@/components/app/AppShell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <div id="main" className="flex flex-1 flex-col items-center px-4 py-10 sm:justify-center sm:py-16">
        <Link href="/" aria-label="Foundly home" className="mb-8">
          <Wordmark />
        </Link>
        <div className="w-full max-w-md">{children}</div>
        <p className="mt-8 text-center text-[12px] text-faint">
          By continuing you agree to our{" "}
          <Link href="/legal/terms" className="underline hover:text-sub">Terms</Link> and{" "}
          <Link href="/legal/privacy" className="underline hover:text-sub">Privacy Policy</Link>.
          {" · "}
          <Link href="/setup" className="underline hover:text-sub">Setup checklist</Link>
        </p>
      </div>
    </div>
  );
}
