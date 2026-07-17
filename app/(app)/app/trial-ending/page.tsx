import { getData } from "@/lib/data";
import { currentScore } from "@/lib/data/selectors";
import { Card } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { LinkButton } from "@/components/ds/Button";
import { Icon, type IconName } from "@/components/icons";
import { StatTile } from "@/components/charts";
import { Confetti } from "@/components/review/Confetti";
import { formatMoney } from "@/lib/utils/format";

const KEEP: { icon: IconName; label: string }[] = [
  { icon: "qr", label: "Your QR codes & review link — always live" },
  { icon: "mail", label: "Monthly Local Growth Score email" },
  { icon: "sparkles", label: "5 AI review drafts every month" },
  { icon: "shield", label: '"Reviews powered by Foundly" badge' },
];

const PAUSES: { icon: IconName; label: string }[] = [
  { icon: "sparkles", label: "GBP Co-Pilot weekly tasks" },
  { icon: "chart", label: "Benchmark & competitor tracking" },
  { icon: "megaphone", label: "Campaigns & automations" },
];

export default async function TrialEndingPage() {
  const data = await getData();
  const score = currentScore(data.metrics);
  const reviewsCaptured = data.subscription.usage.reviewsCaptured;
  const requestsSent = data.subscription.usage.requestsSent;
  const currency = data.subscription.currency;
  const firstName = data.owner.name.split(" ")[0] ?? "there";

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
          <p className="mt-1 max-w-md text-[14px] text-white/80">
            Your 14-day Growth trial is wrapping up. Here&apos;s the real progress you made — it&apos;s yours to keep.
          </p>
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
          {KEEP.map((k) => (
            <li key={k.label} className="flex items-start gap-2.5 rounded-btn border border-hairline p-3">
              <Icon name={k.icon} size={18} className="mt-0.5 shrink-0 text-primary" />
              <span className="text-[13px] text-ink">{k.label}</span>
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
          <h2 className="text-[17px] font-bold text-ink">What pauses on Free</h2>
        </div>
        <ul className="space-y-2">
          {PAUSES.map((p) => (
            <li key={p.label} className="flex items-center gap-2.5 text-[13px] text-sub">
              <Icon name={p.icon} size={16} className="shrink-0 text-faint" />
              {p.label}
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
            Keep Growth — {formatMoney(99, currency)}/mo
          </LinkButton>
          <LinkButton href="/app" variant="secondary" size="lg" fullWidth>
            Continue on Free
          </LinkButton>
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
