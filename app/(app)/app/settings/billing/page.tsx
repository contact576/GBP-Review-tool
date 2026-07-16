import { getData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge, EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { type IconName } from "@/components/icons";
import { formatMoney, formatDate, daysUntil } from "@/lib/utils/format";
import { PLANS, effectivePlan } from "@/lib/billing/plans";
import type { Subscription } from "@/lib/data/types";
import { SettingsNav } from "../SettingsNav";
import { BillingActions } from "./BillingActions";
import { BillingPanel } from "./BillingPanel";

const TRIAL_LENGTH = 14;

const STATUS_BADGE: Record<
  Subscription["status"],
  { tone: "primary" | "gold" | "danger" | "sub" | "neutral"; icon: IconName; label: string }
> = {
  trialing: { tone: "gold", icon: "clock", label: "Trial" },
  active: { tone: "primary", icon: "check-circle", label: "Active" },
  free: { tone: "neutral", icon: "leaf", label: "Free" },
  paused: { tone: "sub", icon: "clock", label: "Paused" },
  past_due: { tone: "danger", icon: "alert", label: "Past due" },
  canceled: { tone: "sub", icon: "x", label: "Canceled" },
};

export default async function BillingSettingsPage() {
  const data = await getData();
  const sub = data.subscription;
  const currency = sub.currency;
  const invoices = data.invoices ?? [];

  const trialing = sub.status === "trialing";
  const effectiveTier = effectivePlan(sub.tier, trialing);
  const plan = PLANS[effectiveTier];

  const trialLeft = trialing && sub.trialEndsAt ? daysUntil(sub.trialEndsAt) : 0;
  const trialDay = Math.max(1, Math.min(TRIAL_LENGTH, TRIAL_LENGTH - trialLeft + 1));
  const trialEndDate = sub.trialEndsAt ? formatDate(sub.trialEndsAt) : "";

  // Displayed headline price follows the subscription's own interval.
  const headlinePrice = sub.interval === "annual" ? plan.priceAnnualMonthly : plan.priceMonthly;

  const badge = STATUS_BADGE[sub.status] ?? STATUS_BADGE.active;

  const u = sub.usage;
  const aiUnlimited = u.aiDraftsLimit === -1;
  const aiPct =
    aiUnlimited || u.aiDraftsLimit <= 0
      ? 0
      : Math.round((u.aiDraftsUsed / u.aiDraftsLimit) * 100);
  const smsPct =
    u.smsCreditsTotal > 0 ? Math.round((u.smsCreditsUsed / u.smsCreditsTotal) * 100) : 0;

  return (
    <div className="space-y-5">
      <PageHeader title="Billing" sub="Your plan, usage, and invoices — with an honest way out." />

      <SettingsNav />

      {/* ── Plan status ──────────────────────────────────────────────── */}
      <Card raised>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[18px] font-bold text-ink">{plan.name}</span>
              <Badge tone={badge.tone} icon={badge.icon}>
                {trialing ? `Trial · day ${trialDay} of ${TRIAL_LENGTH}` : badge.label}
              </Badge>
            </div>

            {trialing ? (
              <p className="max-w-[68ch] text-[14px] text-sub">
                14-day Growth trial — day {trialDay} of {TRIAL_LENGTH}, no card.
                {trialEndDate ? (
                  <>
                    {" "}
                    On {trialEndDate} you keep a free plan (QR, review link, monthly score, 5 AI
                    drafts/mo).
                  </>
                ) : null}
              </p>
            ) : effectiveTier === "free" ? (
              <p className="max-w-[68ch] text-[14px] text-sub">
                You&apos;re on Free — keep your QR, review link, monthly Score, and 5 AI drafts/month,
                forever. Upgrade whenever you&apos;re ready to grow.
              </p>
            ) : sub.status === "paused" ? (
              <p className="max-w-[68ch] text-[14px] text-sub">
                Billing is paused — nothing is deleted. Reactivate or step down to Free below.
              </p>
            ) : sub.status === "past_due" ? (
              <p className="max-w-[68ch] text-[14px] text-sub">
                A payment didn&apos;t go through. Update your card to keep {plan.name} active — no data
                is touched in the meantime.
              </p>
            ) : (
              <p className="max-w-[68ch] text-[14px] text-sub">
                Billed {sub.interval === "annual" ? "annually" : "monthly"}. Pause or downgrade
                anytime — no lock-in.
              </p>
            )}

            {trialing ? (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[13px] font-semibold text-primary">
                  How the trial works
                </summary>
                <p className="mt-1 max-w-[65ch] text-[13px] text-sub">
                  When the trial ends you keep a free plan automatically — your card is never charged
                  unless you choose a paid plan. Your QR codes and review link keep working on Free.
                </p>
              </details>
            ) : null}
          </div>

          <div className="shrink-0 text-right">
            <div className="text-[24px] font-extrabold tabular-nums text-ink">
              {plan.priceMonthly === 0 ? "Free" : formatMoney(headlinePrice, currency)}
            </div>
            <div className="text-[13px] text-faint">
              {plan.priceMonthly === 0
                ? "forever"
                : sub.interval === "annual"
                  ? "per month · billed annually"
                  : "per month"}
            </div>
            {trialing ? (
              <div className="mt-1 text-[12px] font-semibold text-primary">$0 due today</div>
            ) : null}
          </div>
        </div>
      </Card>

      {/* ── Usage meters ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader kicker="This cycle" title="Usage" />
        <div className="space-y-4">
          <Meter
            label="AI drafts"
            used={u.aiDraftsUsed}
            total={u.aiDraftsLimit}
            pct={aiPct}
            unlimited={aiUnlimited}
          />
          <Meter
            label="SMS credits"
            used={u.smsCreditsUsed}
            total={u.smsCreditsTotal}
            pct={smsPct}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-hairline pt-4 text-[13px]">
          <Stat label="Requests sent" value={u.requestsSent} />
          <Stat label="Reviews captured" value={u.reviewsCaptured} />
        </div>
      </Card>

      {/* ── Plan matrix + manage/cancel + celebratory downgrade ──────── */}
      <BillingPanel
        currentTier={effectiveTier}
        status={sub.status}
        trialing={trialing}
        currency={currency}
        defaultInterval={sub.interval}
      />

      {/* ── Invoices ─────────────────────────────────────────────────── */}
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
                    <td className="py-2.5 pr-4 tabular-nums text-sub">
                      {formatMoney(inv.amount, inv.currency)}
                    </td>
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

      {/* ── Data portability + demo control ──────────────────────────── */}
      <Card>
        <CardHeader title="Export & controls" />
        <BillingActions customers={data.customers ?? []} />
        <p className="mt-3 text-[13px] text-faint">
          Your customer graph is always yours — export the full CSV anytime, no lock-in.
        </p>
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
  const value = Math.min(100, pct ?? 0);
  const near = !unlimited && value > 80;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[14px]">
        <span className="flex items-center gap-2 font-semibold text-ink">
          {label}
          {near ? <Badge tone="gold" icon="alert">Near your limit</Badge> : null}
        </span>
        <span className="tabular-nums text-sub">
          {unlimited ? `${used} used · Unlimited` : `${used} / ${total}`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-primary-wash">
        <div
          className={near ? "h-full rounded-full bg-gold-deep" : "h-full rounded-full bg-primary"}
          style={{ width: unlimited ? "100%" : `${value}%` }}
        />
      </div>
      {near ? (
        <p className="mt-1 text-[12px] text-gold-deep">
          You&apos;ve used {value}% of your {label.toLowerCase()} — upgrade for more headroom.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[20px] font-extrabold tabular-nums text-ink">{value}</div>
      <div className="text-faint">{label}</div>
    </div>
  );
}
