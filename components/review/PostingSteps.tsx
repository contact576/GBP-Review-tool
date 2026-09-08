import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils/cn";

/**
 * "What happens next" — the three things a customer does once Google opens.
 *
 * Shown inline above the Google button on the writing step and again on the
 * thank-you page, so nobody is left in a new Google tab wondering what to do.
 * It is information only: it never wraps, delays or gates the public review
 * link (that would be review gating). Wording changes with whether we managed
 * to copy their text, because "paste" is wrong advice when nothing was copied.
 */
export function PostingSteps({
  copied,
  compact,
  className,
}: {
  /** True when the customer's wording is (or will be) on their clipboard. */
  copied: boolean;
  compact?: boolean;
  className?: string;
}) {
  const steps: { icon: IconName; title: string; body: string }[] = [
    {
      icon: "google",
      title: "Google opens in a new tab",
      body: "You'll see the review box for this business, signed in as you.",
    },
    {
      icon: "star",
      title: "Tap the stars",
      body: "Choose the same rating you gave here, or change it — it's yours.",
    },
    copied
      ? {
          icon: "copy",
          title: "Paste your words and tap Post",
          body: "Your review is already copied. Long-press or right-click the box and choose Paste.",
        }
      : {
          icon: "pencil",
          title: "Write your review and tap Post",
          body: "Type it in your own words, then tap Post.",
        },
  ];

  return (
    <ol className={cn("space-y-2", className)} aria-label="How posting works">
      {steps.map((step, index) => (
        <li
          key={step.title}
          className={cn(
            "flex items-start gap-3 rounded-btn border border-hairline bg-card",
            compact ? "px-3 py-2" : "px-3.5 py-3",
          )}
        >
          <span className="relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
            <Icon name={step.icon} size={16} />
            <span className="absolute -left-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold tabular-nums text-white">
              {index + 1}
            </span>
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-bold leading-snug text-ink">{step.title}</div>
            {compact ? null : (
              <p className="mt-0.5 text-[12px] leading-relaxed text-sub">{step.body}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
