import { Icon } from "@/components/icons";
import { MICROCOPY } from "@/lib/compliance/microcopy";

/**
 * COMPLIANCE-CRITICAL COMPONENT.
 *
 * The public Google review link must ALWAYS be visible on the 1–3★ path — it is
 * rendered unconditionally, at equal prominence, never behind a disclosure or a
 * conditional. Review gating (hiding the public link from unhappy customers)
 * violates Google policy and FTC guidance. Do not wrap this in an `if`.
 */
export function PublicGoogleReviewLink({
  reviewUrl,
  prominent = false,
}: {
  reviewUrl: string;
  prominent?: boolean;
}) {
  return (
    <div
      data-compliance="public-google-link"
      className={
        prominent
          ? "rounded-card border border-hairline bg-card p-4"
          : "rounded-card border border-hairline bg-primary-wash/60 p-4"
      }
    >
      <p className="mb-2 text-[13px] text-sub">{MICROCOPY.publicLinkAlways}</p>
      <a
        href={reviewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-btn border border-hairline bg-card px-4 py-3 text-[14px] font-semibold text-ink transition-colors hover:bg-primary-wash"
      >
        <Icon name="google" size={18} />
        Leave a Google review
        <Icon name="external" size={16} className="text-faint" />
      </a>
    </div>
  );
}
