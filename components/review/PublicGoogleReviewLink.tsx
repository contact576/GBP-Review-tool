import { Icon } from "@/components/icons";
import { BrandLogo } from "@/components/icons/brands";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { cn } from "@/lib/utils/cn";

/**
 * COMPLIANCE-CRITICAL COMPONENT.
 *
 * The public Google review link must ALWAYS be visible on the 1–3★ path — it is
 * rendered unconditionally, at equal prominence, never behind a disclosure or a
 * conditional. Review gating (hiding the public link from unhappy customers)
 * violates Google policy and FTC guidance. Do not wrap this in an `if`.
 *
 * `prominent` is the filled primary button — the one action on the writing
 * step. The default is the quieter hairline version for every other screen.
 */
export function PublicGoogleReviewLink({
  reviewUrl,
  prominent = false,
  label = "Leave a Google review",
  onBeforeOpen,
}: {
  reviewUrl: string;
  prominent?: boolean;
  label?: string;
  onBeforeOpen?: () => void;
}) {
  return (
    <div
      data-compliance="public-google-link"
      className={prominent ? undefined : "rounded-card border border-hairline bg-primary-wash/60 p-4"}
    >
      {prominent ? null : <p className="mb-2 text-[13px] text-sub">{MICROCOPY.publicLinkAlways}</p>}
      <a
        href={reviewUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onBeforeOpen?.()}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2.5 rounded-btn px-4 font-semibold transition-all active:scale-[0.99]",
          prominent
            ? "min-h-[54px] bg-primary py-3 text-[16px] font-bold text-white shadow-[0_1px_2px_rgba(23,32,29,0.12),inset_0_1px_0_rgba(255,255,255,0.16)] hover:bg-primary-dark"
            : "min-h-[44px] border border-hairline bg-card py-3 text-[14px] text-ink hover:bg-primary-wash",
        )}
      >
        <BrandLogo name="google" size={prominent ? 26 : 18} tile={prominent} title="" />
        {label}
        <Icon name="external" size={16} className={prominent ? "text-white/70" : "text-faint"} />
      </a>
    </div>
  );
}
