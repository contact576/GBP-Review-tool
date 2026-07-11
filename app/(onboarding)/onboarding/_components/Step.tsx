import Link from "next/link";
import { LinkButton, ProgressRail } from "@/components/ds";

/**
 * Shared wizard step scaffold: progress rail + title at top, scrollable body,
 * and a sticky full-width Continue (with a de-emphasised Skip) pinned to the
 * bottom so it stays thumb-reachable on mobile.
 */
export function Step({
  current,
  eyebrow,
  title,
  subtitle,
  children,
  continueHref,
  continueLabel = "Continue",
  skipHref,
  skipLabel = "Skip for now",
}: {
  current: number;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  continueHref: string;
  continueLabel?: string;
  skipHref?: string;
  skipLabel?: string;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-57px)] flex-col">
      <div className="flex-1 space-y-6 pb-6 pt-6">
        <div className="space-y-4">
          <ProgressRail current={current} total={7} />
          <div className="space-y-1.5">
            {eyebrow ? <div className="kicker">{eyebrow}</div> : null}
            <h1 className="text-[24px] font-extrabold leading-tight text-ink">{title}</h1>
            {subtitle ? <p className="text-[14px] leading-relaxed text-sub">{subtitle}</p> : null}
          </div>
        </div>
        {children}
      </div>

      <div className="sticky bottom-0 space-y-2 bg-gradient-to-t from-paper via-paper to-transparent pb-6 pt-3">
        <LinkButton href={continueHref} size="lg" fullWidth iconRight="chevron-right">
          {continueLabel}
        </LinkButton>
        {skipHref ? (
          <div className="text-center">
            <Link
              href={skipHref}
              className="inline-flex min-h-[40px] items-center justify-center px-4 text-[13px] font-medium text-faint hover:text-sub"
            >
              {skipLabel}
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
