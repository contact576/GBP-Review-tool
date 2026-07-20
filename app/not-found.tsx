import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-paper px-4 py-12">
      <div className="max-w-lg text-center">
        <div className="data-chip text-primary">404</div>
        <h1 className="mt-3 text-[30px] font-extrabold tracking-tight text-ink">Page not found</h1>
        <p className="mt-2 text-[15px] text-sub">The link may be expired, moved, or outside your workspace.</p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-btn bg-primary px-5 text-[14px] font-semibold text-white"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
