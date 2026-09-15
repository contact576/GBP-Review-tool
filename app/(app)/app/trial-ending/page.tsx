import { getData } from "@/lib/data";
import { currentScore } from "@/lib/data/selectors";
import { Card } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { Button, LinkButton } from "@/components/ds/Button";
import { Icon, type IconName } from "@/components/icons";
import { StatTile } from "@/components/charts";
import { Confetti } from "@/components/review/Confetti";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { PLANS, TRIAL_DAYS } from "@/lib/billing/plans";
import { TRIAL_FREE_KEEPS, TRIAL_PAUSES_ON_FREE, trialState } from "@/lib/billing/trial";
import { continueOnFreeAction } from "@/lib/actions";

// Copy lives in lib/billing/trial.ts so the trial emails say the same thing;
// only the icons are chosen here.
const KEEP_ICONS: IconName[] = ["qr", "mail", "sparkles", "shield"];
const PAUSE_ICONS: IconName[] = ["sparkles", "chart", "megaphone", "grid"];

function daysAgo(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default async function TrialEndingPage() {
  const data = await getData();
  const score = currentScore(data.metrics);
  const reviewsCaptured = data.subscription.usage.reviewsCaptured;
  const requestsSent = data.subscription.usage.requestsSent;
  const currency = data.subscription.currency;
  const firstName = data.owner.name.split(" ")[0] ?? "there";

  const trial = trialState(data.subscription);
  const expired = trial.phase === "expired";
  const endDate = trial.endsAt ? formatDate(trial.endsAt) : null;
  const growth = PLANS.growth;

  const status = expired
    ? endDate
      ? `Your ${TRIAL_DAYS}-day full-access trial ended ${daysAgo(trial.daysSinceEnd)} (${endDate}). The paid tools are paused — here's the real progress you made, and it's yours to keep.`
      : `Your ${TRIAL_DAYS}-day full-access trial has ended. The paid tools are paused — here's the real progress you made, and it's yours to keep.`
    : trial.phase === "ending_soon" || trial.phase === "trialing"
      ? `Your ${TRIAL_DAYS}-day full-access trial wraps up${endDate ? ` on ${endDate}` : ""} — ${trial.daysLeft} ${trial.daysLeft === 1 ? "day" : "days"} left. Here's the real progress you made, and it's yours to keep.`
      : "Here's the real progress you made — it's yours to keep.";

  return (
    <div className="space-y-5">
      <Confetti fire />

      {/* Celebration hero */}
      <div className="on-hero relative overflow-hidden rounded-card bg-hero p-6 text-white shadow-lg sm:p-8">
        <div className="absolute -right-8 -top-8 size-40 rounded-full bg-gold/15" />
        <div className="relative">
          <div className="mb-3 inline-grid size-12 place-items-center rounded-btn bg-gold text-hero">
            <Icon name="trophy" size={24} />
          </div>
          <h1 className="text-[26px] font-extrabold leading-tight sm:text-[30px]">
            Look what you built, {firstName}
          </h1>
          <p className="mt-1 max-w-md text-[14px] text-white/80">{status}</p>
          {expired && endDate ? (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-chip bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-white/90">
              <Icon name="clock" size={13} /> Trial ended {endDate}
            </div>
          ) : null}
          <div className="mt-5 grid grid-cols-3 gap-3">
            <StatTile onHero label="Reviews captured" value={reviewsCaptured} />
            <StatTile onHero label="Growth Score points" value={score.delta >= 0 ? `+${score.delta}` : `${score.delta}`} />
            <StatTile onHero label="Requests sent" value={requestsSent} />
          </div>
        </div>
      </div>

      {/* Keep on free */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-btn bg-primary-tint text-primary-dark">
            <Icon name="check-circle" size={18} />
          </div>
          <h2 className="text-[17px] font-bold text-ink">What you keep — free, forever</h2>
        </div>
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {TRIAL_FREE_KEEPS.map((label, index) => (
            <li key={label} className="flex items-start gap-2.5 rounded-btn border border-hairline p-3">
              <Icon name={KEEP_ICONS[index] ?? "check-circle"} size={18} className="mt-0.5 shrink-0 text-primary" />
              <span className="text-[13px] text-ink">{label}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* What pauses */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-btn bg-gold-tint text-gold-deep">
            <Icon name="clock" size={18} />
          </div>
          <h2 className="text-[17px] font-bold text-ink">
            {expired ? "Paused on Free" : "What pauses on Free"}
          </h2>
        </div>
        <ul className="space-y-2">
          {TRIAL_PAUSES_ON_FREE.map((label, index) => (
            <li key={label} className="flex items-center gap-2.5 text-[13px] text-sub">
              <Icon name={PAUSE_ICONS[index] ?? "clock"} size={16} className="shrink-0 text-faint" />
              {label}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-faint">
          Nothing is deleted. Upgrade anytime and everything switches back on exactly where you left it.
        </p>
      </Card>

      {/* Choices — no dark patterns */}
      <Card raised>
        <div className="flex flex-col gap-3">
          <LinkButton href="/app/settings/billing" size="lg" icon="sparkles" fullWidth>
            {expired ? "Switch everything back on" : "Keep Growth"} — {formatMoney(growth.priceMonthly, currency)}/mo
          </LinkButton>
          {expired ? (
            <form action={continueOnFreeAction}>
              <Button type="submit" variant="secondary" size="lg" fullWidth>
                Continue on Free
              </Button>
            </form>
          ) : (
            <LinkButton href="/app" variant="secondary" size="lg" fullWidth>
              Back to the dashboard
            </LinkButton>
          )}
          <p className="text-center text-[12px] text-faint">
            Both options are one tap. No card required to stay on Free.
          </p>
        </div>
      </Card>

      <div className="flex justify-center">
        <Badge tone="neutral" icon="shield">Your data and QR codes stay yours either way</Badge>
      </div>
    </div>
  );
}
