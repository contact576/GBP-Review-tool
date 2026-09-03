import { getSessionAndData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge, EmptyState } from "@/components/ds/misc";
import { ProgressMeter } from "@/components/charts";
import { PageHeader } from "@/components/app/PageHeader";
import { type IconName } from "@/components/icons";
import { formatMoney, formatNumber, formatDate } from "@/lib/utils/format";
import { PLANS, TRIAL_DAYS } from "@/lib/billing/plans";
import { entitledPlan, trialState, trialUnlocks } from "@/lib/billing/trial";
import type { Subscription } from "@/lib/data/types";
import { SettingsNav } from "../SettingsNav";
import { BillingActions } from "./BillingActions";
import { BillingPanel } from "./BillingPanel";

const TRIAL_LENGTH = TRIAL_DAYS;

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
  const { data, session } = await getSessionAndData();
  const sub = data.subscription;
  const currency = sub.currency;
  const invoices = data.invoices ?? [];

  // Trial-aware (lib/billing/trial.ts): `trialing` is true only while the
  // trial is live, and an expired one is entitled to Free — not to the Growth
  // tier the row still records from sign-up.
  const trial = trialState(sub);
  const trialing = trialUnlocks(sub);
  const trialEnded = trial.phase === "expired";
  const effectiveTier = entitledPlan(sub);
  const plan = PLANS[effectiveTier];

  const trialLeft = trialing ? trial.daysLeft : 0;
  const trialDay = Math.max(1, Math.min(TRIAL_LENGTH, TRIAL_LENGTH - trialLeft + 1));
  const trialEndDate = trial.endsAt ? formatDate(trial.endsAt) : "";

  // Displayed headline price follows the subscription's own interval.
  const headlinePrice = sub.interval === "annual" ? plan.priceAnnualMonthly : plan.priceMonthly;

  const badge: (typeof STATUS_BADGE)[keyof typeof STATUS_BADGE] = trialEnded
    ? { tone: "danger", icon: "clock", label: "Trial ended" }
    : (STATUS_BADGE[sub.status] ?? STATUS_BADGE.active);

  const u = sub.usage;
  const aiUnlimited = u.aiDraftsLimit === -1;
  const aiNear = !aiUnlimited && u.aiDraftsLimit > 0 && u.aiDraftsUsed / u.aiDraftsLimit >= 0.8;
  const smsNear = u.smsCreditsTotal > 0 && u.smsCreditsUsed / u.smsCreditsTotal >= 0.8;

  return (
    <div className="space-y-5">
      <PageHeader title="Billing" sub="Your plan, usage, and invoices — with an honest way out." />

      <SettingsNav />

      {/* ── Plan status ──────────────────────────────────────────────── */}
      <Card raised>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="kicker mb-1.5">Your plan</div>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[18px] font-bold text-ink">{plan.name}</span>
              <Badge tone={badge.tone} icon={badge.icon}>
                {trialing ? `Trial · day ${trialDay} of ${TRIAL_LENGTH}` : badge.label}
              </Badge>
            </div>

            {trialing ? (
              <p className="max-w-[68ch] text-[14px] text-sub">
                Every tool unlocked — day {trialDay} of {TRIAL_LENGTH}, no card.
                {trialEndDate ? (
                  <>
                    {" "}
                    On {trialEndDate} you keep a free plan (QR, review link, monthly score, 5 AI
                    drafts/mo).
                  </>
                ) : null}
              </p>
            ) : trialEnded ? (
              <p className="max-w-[68ch] text-[14px] text-sub">
                Your {TRIAL_LENGTH}-day trial ended{trialEndDate ? ` on ${trialEndDate}` : ""}. Nothing
                was charged and nothing was deleted — pick a plan below to switch every tool back on,
                or keep going on Free.
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

            {sub.currentPeriodEnd && !trialing && effectiveTier !== "free" ? (
              <p className="mt-2 text-[12px] font-semibold text-faint">
                {sub.cancelAtPeriodEnd ? "Access continues until" : "Next renewal"}: {formatDate(sub.currentPeriodEnd)}
              </p>
            ) : null}

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
          <ProgressMeter
            label="AI drafts"
            value={aiUnlimited ? 1 : u.aiDraftsUsed}
            max={aiUnlimited ? 1 : Math.max(1, u.aiDraftsLimit)}
            valueText={
              aiUnlimited
                ? `${formatNumber(u.aiDraftsUsed)} used · Unlimited`
                : `${formatNumber(u.aiDraftsUsed)} / ${formatNumber(u.aiDraftsLimit)}`
            }
            nearLimitAt={aiUnlimited ? undefined : 0.8}
            nearLimitTone="danger"
          />
          <ProgressMeter
            label="SMS credits"
            value={u.smsCreditsUsed}
            max={Math.max(1, u.smsCreditsTotal)}
            valueText={
              u.smsCreditsTotal > 0
                ? `${formatNumber(u.smsCreditsUsed)} / ${formatNumber(u.smsCreditsTotal)}`
                : "Not on this plan"
            }
            nearLimitAt={u.smsCreditsTotal > 0 ? 0.8 : undefined}
            nearLimitTone="danger"
          />
        </div>
        {aiNear || smsNear ? (
          <p className="mt-3 text-[12px] text-danger">
            You&apos;re close to your{" "}
            {aiNear && smsNear ? "AI draft and SMS" : aiNear ? "AI draft" : "SMS"} limit for this
            cycle. Upgrading adds headroom.
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-hairline pt-4">
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
                <tr className="border-b border-hairline">
                  <th className="py-2.5 pr-4 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
                    Period
                  </th>
                  <th className="py-2.5 pr-4 text-right font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
                    Amount
                  </th>
                  <th className="py-2.5 pr-4 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
                    Status
                  </th>
                  <th className="py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
                    Issued
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2.5 pr-4 font-semibold text-ink">{inv.period}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-sub">
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
        <BillingActions customers={data.customers ?? []} isDemo={session.isDemo} />
        <p className="mt-3 text-[13px] text-faint">
          Your customer graph is always yours — export the full CSV anytime, no lock-in.
        </p>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[22px] font-extrabold tabular-nums leading-none text-ink">
        {formatNumber(value)}
      </div>
      <div className="kicker normal-case mt-1">{label}</div>
    </div>
  );
}
