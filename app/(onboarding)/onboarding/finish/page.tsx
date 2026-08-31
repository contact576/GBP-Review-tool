import Link from "next/link";
import { getData } from "@/lib/data";
import { Badge, LinkButton } from "@/components/ds";
import { Icon } from "@/components/icons";
import { StepTimeline } from "../_components/StepTimeline";
import { buildSetupChecklist } from "../_components/setup-checklist";

/**
 * Honest finish screen. Every row reads a real workspace signal (see
 * `buildSetupChecklist`), the count is the actual count, and the gold
 * celebration is withheld until setup is genuinely complete — someone who
 * skipped every step lands here on 0/7 with the highest-value next step named.
 */
export default async function FinishPage() {
  const data = await getData();
  const businessName = data.location.name || "Your business";
  const checklist = buildSetupChecklist(data);
  const { items, completed, total, allComplete, next } = checklist;
  const remaining = total - completed;

  return (
    <div className="flex min-h-[calc(100dvh-57px)] flex-col">
      <div className="flex-1 space-y-6 pb-6 pt-6">
        <StepTimeline current={7} stepDone={checklist.stepDone} />

        {/* Header — the trophy is reserved for a genuinely finished setup. */}
        <div className="flex flex-col items-center pt-2 text-center">
          {allComplete ? (
            <div className="grid size-16 place-items-center rounded-card bg-hero text-gold shadow-lg">
              <Icon name="trophy" size={32} />
            </div>
          ) : (
            <div className="grid size-16 place-items-center rounded-card border border-hairline bg-primary-wash text-primary">
              <Icon name="compass" size={32} />
            </div>
          )}
          <h1 className="mt-4 text-[26px] font-extrabold leading-tight tracking-tight text-ink">
            {allComplete ? "You're live!" : "Almost there"}
          </h1>
          <p className="mt-1.5 text-[14px] text-sub">
            {allComplete ? (
              <>{businessName} is set up to earn steady, durable reviews.</>
            ) : (
              <>
                <span className="tabular-nums font-semibold text-ink">
                  {completed} of {total}
                </span>{" "}
                setup steps are done for {businessName} —{" "}
                <span className="tabular-nums">{remaining}</span>{" "}
                {remaining === 1 ? "still needs" : "still need"} you.
              </>
            )}
          </p>
        </div>

        {/* Live completion checklist — derived from workspace state, never assumed. */}
        <div className="rounded-card border border-hairline bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="kicker">Setup checklist</div>
            <span
              className={allComplete ? "data-chip text-primary-dark" : "data-chip text-sub"}
              aria-label={`${completed} of ${total} setup steps done`}
            >
              {completed}/{total} done
            </span>
          </div>

          <ul className="divide-y divide-hairline">
            {items.map((item) => (
              <li key={item.key} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <span
                  aria-hidden
                  className={
                    item.done
                      ? "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-white"
                      : "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-card text-faint ring-1 ring-hairline"
                  }
                >
                  <Icon name={item.done ? "check" : item.icon} size={14} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className={
                        item.done ? "text-[14px] text-sub" : "text-[14px] font-bold text-ink"
                      }
                    >
                      {item.label}
                    </span>
                    {/* Status is carried by icon + word, never colour alone. */}
                    {item.done ? (
                      <Badge tone="primary" icon="check">
                        Done
                      </Badge>
                    ) : (
                      <Badge tone="sub" icon="clock">
                        To do
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-faint">{item.detail}</p>
                  {!item.done ? (
                    <Link
                      href={item.href}
                      className="mt-1 inline-flex min-h-[32px] items-center gap-1 text-[13px] font-semibold text-primary-dark hover:underline"
                    >
                      Finish this step
                      <Icon name="chevron-right" size={14} />
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* The single most valuable thing left. Gold is spent only on the
            genuinely-earned post-setup milestone. */}
        {next ? (
          <div
            className={
              next.earned
                ? "rounded-card bg-gold-tint p-4"
                : "rounded-card border border-hairline bg-primary-wash p-4"
            }
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="kicker">{next.earned ? "Your first milestone" : "Do this next"}</div>
              <Badge
                tone={next.earned ? "gold" : "primary"}
                icon={next.earned ? "star-fill" : "arrow-right"}
              >
                Next
              </Badge>
            </div>
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={
                  next.earned
                    ? "grid size-9 shrink-0 place-items-center rounded-btn bg-gold text-gold-deep"
                    : "grid size-9 shrink-0 place-items-center rounded-btn bg-primary text-white"
                }
              >
                <Icon name={next.icon} size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-ink">{next.label}</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-sub">{next.detail}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-card border border-primary/30 bg-primary-tint p-4">
            <Icon name="check-circle" size={22} className="mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold text-primary-dark">
                Setup done — and your first invite is out
              </div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-sub">
                Nothing is outstanding. Your dashboard tracks every request from here.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 space-y-2 border-t border-hairline bg-paper pb-6 pt-3">
        {next ? (
          <LinkButton href={next.href} size="lg" fullWidth iconRight="arrow-right">
            {next.earned ? next.label : "Finish setup"}
          </LinkButton>
        ) : (
          <LinkButton href="/app" size="lg" fullWidth iconRight="arrow-right">
            Go to dashboard
          </LinkButton>
        )}
        <div className="text-center">
          <Link
            href={next ? "/app" : "/app/settings/team"}
            className="inline-flex min-h-[40px] items-center justify-center px-4 text-[13px] font-medium text-faint hover:text-sub"
          >
            {next ? "Go to dashboard" : "Fine-tune settings first"}
          </Link>
        </div>
      </div>
    </div>
  );
}
