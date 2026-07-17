import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";

/**
 * Staged-pill onboarding timeline (structure only — green tints, no pastels).
 * Done stages fill green with a check; the current stage rings green; upcoming
 * stages stay hairline. Gold is intentionally NOT used here — a routine step is
 * not a celebration (that's reserved for the genuine finish milestone).
 */

export const ONBOARDING_STEPS: { label: string; icon: IconName }[] = [
  { label: "Find business", icon: "search" },
  { label: "Business type", icon: "grid" },
  { label: "Connect Google", icon: "google" },
  { label: "Channels", icon: "send" },
  { label: "QR kit", icon: "qr" },
  { label: "Test invite", icon: "eye" },
  { label: "Invite team", icon: "users" },
];

export function StepTimeline({
  current,
  total = ONBOARDING_STEPS.length,
  allComplete = false,
}: {
  current: number;
  total?: number;
  allComplete?: boolean;
}) {
  const label = ONBOARDING_STEPS[current - 1]?.label;
  return (
    <div>
      <ol
        className="flex items-center"
        aria-label={`Onboarding progress: step ${current} of ${total}`}
      >
        {Array.from({ length: total }).map((_, i) => {
          const stepNo = i + 1;
          const done = allComplete || stepNo < current;
          const isCurrent = !allComplete && stepNo === current;
          return (
            <li key={stepNo} className={cn("flex items-center", i < total - 1 && "flex-1")}>
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold tabular-nums transition-colors",
                  done && "bg-primary text-white",
                  isCurrent && "bg-card text-primary-dark ring-2 ring-primary",
                  !done && !isCurrent && "bg-card text-faint ring-1 ring-hairline",
                )}
              >
                {done ? <Icon name="check" size={14} /> : stepNo}
              </span>
              {i < total - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "mx-1 h-0.5 flex-1 rounded-full transition-colors",
                    done ? "bg-primary" : "bg-hairline",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {label ? (
        <div className="mt-2 data-chip text-faint">
          Step {current} of {total} · <span className="text-sub">{label}</span>
        </div>
      ) : null}
    </div>
  );
}
