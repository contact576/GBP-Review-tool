import { getData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge, EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon } from "@/components/icons";
import { PricingTierCard, type Tier } from "@/components/app/PricingTierCard";
import { formatMoney, formatDate, daysUntil } from "@/lib/utils/format";
import { currencySymbol } from "@/lib/utils/region";
import { SettingsNav } from "../SettingsNav";
import { BillingActions, CancelPath } from "./BillingActions";

const TRIAL_LENGTH = 14;

export default async function BillingSettingsPage() {
  const data = await getData();
  const sub = data.subscription;
  const currency = sub.currency;
  const region = data.location.region;
  const symbol = currencySymbol(region);
  const invoices = data.invoices ?? [];

  const trialLeft = sub.status === "trialing" && sub.trialEndsAt ? daysUntil(sub.trialEndsAt) : 0;
  const trialDay = Math.max(1, Math.min(TRIAL_LENGTH, TRIAL_LENGTH - trialLeft + 1));

  const usage = sub.usage;
  const smsPct = usage.smsCreditsTotal > 0 ? Math.round((usage.smsCreditsUsed / usage.smsCreditsTotal) * 100) : 0;

  const tiers: Tier[] = [
    {
      name: "Free",
      price: 0,
      cadence: "forever",
      tagline: "Keep capturing reviews at no cost.",
      features: ["QR codes & review link", "Monthly Score email", "5 AI drafts / month", "Foundly badge"],
      cta: "Downgrade to Free",
      href: "/app/trial-ending",
    },
    {
      name: "Growth",
      price: 99,
      cadence: "mo",
      tagline: "The full growth engine for one location.",
      features: ["Everything in Free", "GBP Co-Pilot tasks", "Unlimited AI drafts", "Benchmark & campaigns", "SMS credits"],
      cta: "Keep Growth",
      href: "/app/settings/billing",
      anchor: true,
      current: true,
    },
    {
      name: "Pro",
      price: 179,
      cadence: "mo",
      tagline: "AI Visibility and Rank Grid on top.",
      features: ["Everything in Growth", "AI Visibility (AEO)", "Rank Grid maps", "Priority support"],
      cta: "Upgrade to Pro",
      href: "/app/settings/billing",
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Billing" sub="Your plan, usage, and invoices — with an honest way out." />

      <SettingsNav />

      {/* Plan status */}
      <Card raised>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[18px] font-bold text-ink">Growth</span>
              {sub.status === "trialing" ? (
                <Badge tone="gold" icon="clock">Trial · day {trialDay} of {TRIAL_LENGTH}</Badge>
              ) : (
                <Badge tone="primary" icon="check-circle">Active</Badge>
              )}
            </div>
            <p className="text-[14px] text-sub">
              {sub.status === "trialing"
                ? `${trialLeft} day${trialLeft === 1 ? "" : "s"} left on your trial.`
                : "Billed monthly. Cancel or downgrade anytime."}
            </p>
            {sub.status === "trialing" ? (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[13px] font-semibold text-primary">How the trial works</summary>
                <p className="mt-1 max-w-[65ch] text-[13px] text-sub">
                  When the trial ends you keep a free plan automatically — your card is never charged unless
                  you choose a paid plan. Your QR codes and review link keep working on Free.
                </p>
              </details>
            ) : null}
          </div>
          <div className="text-right">
            <div className="text-[24px] font-extrabold tabular-nums text-ink">{formatMoney(99, currency)}</div>
            <div className="text-[13px] text-faint">per month</div>
          </div>
        </div>
      </Card>

      {/* Usage meters */}
      <Card>
        <CardHeader kicker="This cycle" title="Usage" />
        <div className="space-y-4">
          <Meter label="AI drafts" used={usage.aiDraftsUsed} total={usage.aiDraftsLimit} unlimited />
          <Meter label="SMS credits" used={usage.smsCreditsUsed} total={usage.smsCreditsTotal} pct={smsPct} />
          <Meter label="Requests sent" used={usage.requestsSent} total={-1} unlimited />
        </div>
      </Card>

      {/* Plan matrix */}
      <div>
        <div className="mb-3 text-[16px] font-bold text-ink">Change plan</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {tiers.map((t) => (
            <PricingTierCard key={t.name} tier={t} currencySymbol={symbol} />
          ))}
        </div>
      </div>

      {/* Invoices */}
      <Card>
        <CardHeader title="Invoices" />
        {invoices.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-hairline text-faint">
                  <th className="py-2 pr-4 font-medium">Period</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Issued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2.5 pr-4 font-semibold text-ink">{inv.period}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-sub">{formatMoney(inv.amount, inv.currency)}</td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={inv.status === "paid" ? "primary" : inv.status === "open" ? "gold" : "sub"}>
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-sub">{formatDate(inv.issuedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="file"
            title="No invoices yet"
            description="Your invoices will appear here once billing starts."
          />
        )}
      </Card>

      {/* Data portability + demo control */}
      <Card>
        <CardHeader title="Export & controls" />
        <BillingActions customers={data.customers ?? []} />
        <p className="mt-3 text-[13px] text-faint">
          Your customer graph is always yours — export the full CSV anytime, no lock-in.
        </p>
      </Card>

      {/* Honest cancel path */}
      <Card className="border-hairline">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
              <Icon name="shield" size={20} />
            </div>
            <div>
              <div className="text-[16px] font-bold text-ink">Need to step back?</div>
              <p className="mt-0.5 text-[14px] text-sub">Cancelling routes you to pause or Free — never a locked door.</p>
              <p className="text-[14px] text-sub">Printed QR codes keep redirecting to Google for 90 days.</p>
            </div>
          </div>
          <div className="shrink-0">
            <CancelPath />
          </div>
        </div>
      </Card>
    </div>
  );
}

function Meter({
  label,
  used,
  total,
  pct,
  unlimited,
}: {
  label: string;
  used: number;
  total: number;
  pct?: number;
  unlimited?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[14px]">
        <span className="font-semibold text-ink">{label}</span>
        <span className="tabular-nums text-sub">
          {unlimited ? `${used} used · Unlimited` : `${used} / ${total}`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-primary-wash">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: unlimited ? "100%" : `${Math.min(100, pct ?? 0)}%` }}
        />
      </div>
    </div>
  );
}
