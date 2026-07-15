import Link from "next/link";
import { findRequestByToken } from "@/lib/data";
import { Icon } from "@/components/icons";
import { Wordmark } from "@/components/app/AppShell";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { Confetti } from "@/components/review/Confetti";

export default async function ThanksPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await findRequestByToken(token);
  const business = result?.location.name ?? "the business";

  return (
    <>
      <Confetti fire />
      <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        <div className="grid size-16 place-items-center rounded-card bg-gold-tint text-gold-deep">
          <Icon name="star-fill" size={32} />
        </div>
        <h1 className="mt-5 text-[24px] font-extrabold text-ink">You just made {business}&apos;s day 🎉</h1>
        <p className="mt-2 max-w-xs text-[14px] text-sub">
          Thanks for sharing your experience. Adding a photo to your review makes it even more helpful.
        </p>
        <a
          href={result?.location.reviewUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-btn border border-hairline bg-card px-5 py-3 text-[14px] font-semibold text-ink"
        >
          <Icon name="camera" size={18} /> Add a photo on Google
        </a>
        <Link href="/" className="mt-4 text-[13px] text-faint underline">Done</Link>
      </div>
      <footer className="border-t border-hairline py-4 text-center">
        <span className="text-[11px] text-faint">{MICROCOPY.poweredByFoundly}</span>
        <div className="mt-1 flex justify-center opacity-60"><Wordmark small /></div>
      </footer>
    </>
  );
}
