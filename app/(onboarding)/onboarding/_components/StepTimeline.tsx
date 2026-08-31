import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";

/**
 * Staged-pill onboarding timeline (structure only — green tints, no pastels).
 * Done stages fill green with a check; the current stage rings green; upcoming
 * stages stay hairline. Gold is intentionally NOT used here — a routine step is
 * not a celebration (that's reserved for the genuine finish milestone).
 *
 * Completion is REAL: `stepDone` carries per-step booleans derived from
 * workspace state (see `buildSetupChecklist`), so a step only reads as done
 * when its signal is genuinely present. Omit it and the timeline shows
 * position only — nothing claims to be finished, because "you walked past
 * this screen" is not evidence that the step was completed.
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
  stepDone,
}: {
  current: number;
  total?: number;
  /** Per-step completion, index 0 = step 1. Omit when it isn't known. */
  stepDone?: boolean[];
}) {
  const label = ONBOARDING_STEPS[current - 1]?.label;
  const doneCount = stepDone ? stepDone.filter(Boolean).length : null;

  return (
    <div>
      <ol
        className="flex items-center"
        aria-label={
          doneCount === null
            ? `Onboarding progress: step ${current} of ${total}`
            : `Onboarding progress: ${doneCount} of ${total} steps complete`
        }
      >
        {Array.from({ length: total }).map((_, i) => {
          const stepNo = i + 1;
          const done = stepDone?.[i] === true;
          const isCurrent = stepNo === current;
          const stepLabel = ONBOARDING_STEPS[i]?.label ?? `Step ${stepNo}`;
          return (
            <li key={stepNo} className={cn("flex items-center", i < total - 1 && "flex-1")}>
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold tabular-nums transition-colors",
                  done && !isCurrent && "bg-primary text-white",
                  done && isCurrent && "bg-primary text-white ring-2 ring-primary/40",
                  !done && isCurrent && "bg-card text-primary-dark ring-2 ring-primary",
                  !done && !isCurrent && "bg-card text-faint ring-1 ring-hairline",
                )}
              >
                {done ? <Icon name="check" size={14} /> : stepNo}
                <span className="sr-only">
                  {stepLabel}
                  {done ? " — done" : " — not done yet"}
                </span>
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
          {doneCount !== null ? (
            <>
              {" · "}
              <span className="tabular-nums text-sub">
                {doneCount}/{total} done
              </span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
