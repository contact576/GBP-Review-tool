import Link from "next/link";
import { Icon } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4">
      <div className="text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-card bg-primary-wash text-primary">
          <Icon name="compass" size={28} />
        </div>
        <h1 className="text-[24px] font-extrabold text-ink">Page not found</h1>
        <p className="mt-1 text-[14px] text-sub">This link may have expired or moved.</p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-btn bg-primary px-5 py-3 text-[14px] font-semibold text-white hover:bg-primary-dark"
        >
          <Icon name="home" size={18} /> Back to home
        </Link>
      </div>
    </div>
  );
}
