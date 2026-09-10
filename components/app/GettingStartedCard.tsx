import Link from "next/link";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ds/misc";
import { buildSetupChecklist } from "@/app/(onboarding)/onboarding/_components/setup-checklist";
import type { FoundlyData } from "@/lib/data/types";

/**
 * The dashboard's "what do I do now" card for a workspace that is not fully
 * set up. Every row is derived from real workspace state by the same
 * `buildSetupChecklist` the onboarding wizard uses — the same eight steps,
 * the same signals — so the wizard and the dashboard never disagree. The card
 * disappears on its own once setup is complete and a real invite has gone out.
 *
 * Server component: it reads delivery adapters through the checklist builder.
 */
export function GettingStartedCard({ data }: { data: FoundlyData }) {
  const checklist = buildSetupChecklist(data);
  if (checklist.allComplete && checklist.firstInviteSent) return null;

  const { completed, total, next, items } = checklist;
  const outstanding = items.filter((item) => !item.done).sort((a, b) => a.priority - b.priority);
  const percent = Math.round((completed / total) * 100);

  return (
    <section className="premium-card overflow-hidden" aria-labelledby="getting-started-title">
      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="getting-started-title" className="text-[15px] font-bold text-ink">
              Getting started
            </h2>
            <Badge tone={completed === total ? "primary" : "neutral"}>
              <span className="tabular-nums">{completed}/{total}</span> set up
            </Badge>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-sub">
            {next
              ? next.earned
                ? "Setup is done. The one move left is the one that earns reviews."
                : `Finish these and every review ask lands on a page built for ${data.location.name}.`
              : "All set."}
          </p>

          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-ink/[.06]" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>

          {outstanding.length ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {outstanding.slice(0, 4).map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="tile-row flex items-center gap-3 px-3 py-2.5 text-[14px] font-semibold text-ink"
                  >
                    <span className="icon-plate icon-plate-sm">
                      <Icon name={item.icon} size={15} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <Icon name="chevron-right" size={15} className="shrink-0 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {next ? (
          <div
            className={
              next.earned
                ? "w-full shrink-0 rounded-md border border-gold/30 bg-gold-tint p-4 lg:w-[320px]"
                : "w-full shrink-0 rounded-md border border-hairline bg-primary-wash p-4 lg:w-[320px]"
            }
          >
            <div className="kicker">{next.earned ? "Your first milestone" : "Do this next"}</div>
            <div className="mt-2 flex items-start gap-3">
              <span
                className={
                  next.earned
                    ? "grid size-10 shrink-0 place-items-center rounded-[12px] bg-gold text-ink"
                    : "grid size-10 shrink-0 place-items-center rounded-[12px] bg-primary text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)]"
                }
              >
                <Icon name={next.icon} size={15} />
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-bold leading-snug tracking-[-0.01em] text-ink">{next.label}</div>
                <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-sub">{next.detail}</p>
              </div>
            </div>
            <Link
              href={next.href}
              className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              {next.earned ? next.label : "Continue setup"} <Icon name="arrow-right" size={13} />
            </Link>
          </div>
        ) : null}
      </div>
      <div className="panel-foot flex-wrap">
        <Link href="/onboarding/finish" className="premium-card-link inline-flex items-center gap-1 whitespace-nowrap">
          Open the full setup checklist <Icon name="chevron-right" size={12} />
        </Link>
        <Link href="/app?tour=1" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-sub transition-colors hover:text-ink">
          <Icon name="compass" size={14} /> Take the 1-minute tour
        </Link>
      </div>
    </section>
  );
}
