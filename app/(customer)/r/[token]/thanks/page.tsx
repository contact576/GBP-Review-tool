import Link from "next/link";
import { findRequestByToken } from "@/lib/data";
import { Icon } from "@/components/icons";
import { Confetti } from "@/components/review/Confetti";

export default async function ThanksPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await findRequestByToken(token);
  const business = result?.location.name ?? "the business";

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
      <Confetti fire />
      <div className="relative animate-slide-up">
        {/* Restrained gold spark — CSS only, respects reduced motion via globals. */}
        <span className="pointer-events-none absolute -right-1 -top-1 text-gold animate-fade-in" aria-hidden>
          <Icon name="sparkles" size={20} />
        </span>
        <div className="grid size-20 place-items-center rounded-card bg-gold-tint text-gold-deep shadow-lg">
          <Icon name="star-fill" size={38} />
        </div>
      </div>
      <h1 className="mt-6 text-[24px] font-extrabold leading-tight text-ink animate-slide-up">
        Your review is ready to share
      </h1>
      <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-sub">
        Finish posting it in the Google tab. If you already did, thank you for supporting {business}.
      </p>
      <a
        href={result?.location.reviewUrl ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-btn border border-hairline bg-card px-5 py-3 text-[14px] font-semibold text-ink transition-all hover:bg-primary-wash active:scale-[0.98]"
      >
        <Icon name="google" size={18} /> Return to Google
      </a>
      <Link href="/" className="mt-4 inline-flex min-h-[44px] items-center text-[13px] text-faint underline underline-offset-2 transition-all active:scale-[0.98]">
        Done
      </Link>
    </div>
  );
}
