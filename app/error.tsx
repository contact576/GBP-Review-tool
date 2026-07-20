"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Foundly route error", { digest: error.digest, message: error.message });
  }, [error]);
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-paper px-4 py-12">
      <div className="w-full max-w-lg rounded-card border border-hairline bg-card p-8 text-center shadow-lg">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-danger-tint text-[22px] font-black text-danger">!</div>
        <h1 className="mt-4 text-[24px] font-extrabold text-ink">This page hit a problem</h1>
        <p className="mt-2 text-[14px] leading-6 text-sub">
          Your data is safe. Try loading the page again; if it repeats, share the reference below with support.
        </p>
        {error.digest ? <p className="mt-3 font-mono text-[12px] text-faint">Reference: {error.digest}</p> : null}
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <button type="button" onClick={reset} className="min-h-11 rounded-btn bg-primary px-5 text-[14px] font-semibold text-white">Try again</button>
          <Link href="/app" className="inline-flex min-h-11 items-center justify-center rounded-btn border border-hairline px-5 text-[14px] font-semibold text-ink">Back to dashboard</Link>
        </div>
      </div>
    </main>
  );
}
