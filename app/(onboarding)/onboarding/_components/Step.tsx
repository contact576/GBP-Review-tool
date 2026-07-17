import Link from "next/link";
import { LinkButton } from "@/components/ds";
import { Icon } from "@/components/icons";
import { ONBOARDING_STEPS, StepTimeline } from "./StepTimeline";

/**
 * Shared wizard step scaffold: staged-pill timeline + a numbered step card
 * (square icon plate + step number) on a warm-tinted panel, a scrollable body,
 * and a sticky solid-paper footer with the single next action (plus a
 * de-emphasised Skip) pinned thumb-reachable at the bottom.
 */
export function Step({
  current,
  title,
  subtitle,
  children,
  continueHref,
  continueLabel = "Continue",
  skipHref,
  skipLabel = "Skip for now",
}: {
  current: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  continueHref: string;
  continueLabel?: string;
  skipHref?: string;
  skipLabel?: string;
}) {
  const meta = ONBOARDING_STEPS[current - 1];

  return (
    <div className="flex min-h-[calc(100dvh-57px)] flex-col">
      <div className="flex-1 space-y-6 pb-6 pt-6">
        <StepTimeline current={current} />

        {/* Numbered step card — warm-tinted panel */}
        <div className="rounded-card border border-hairline bg-primary-wash/50 p-4">
          <div className="flex items-start gap-3.5">
            <div className="relative grid size-11 shrink-0 place-items-center rounded-btn bg-primary text-white shadow-sm">
              <Icon name={meta?.icon ?? "sparkles"} size={22} />
              <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-hero text-[11px] font-bold tabular-nums text-white ring-2 ring-paper">
                {current}
              </span>
            </div>
            <div className="min-w-0 pt-0.5">
              <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-1 text-[14px] leading-relaxed text-sub">{subtitle}</p>
              ) : null}
            </div>
          </div>
        </div>

        {children}
      </div>

      <div className="sticky bottom-0 space-y-2 border-t border-hairline bg-paper pb-6 pt-3">
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
