"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Card, CardHeader } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { useToast } from "@/components/ds/Toast";
import { Icon } from "@/components/icons";
import { Confetti } from "@/components/review/Confetti";
import { formatMoney } from "@/lib/utils/format";
import { PLANS, PLAN_ORDER, type Feature, type PlanId } from "@/lib/billing/plans";
import {
  startCheckoutAction,
  changePlanAction,
  pauseSubscriptionAction,
  downgradeToFreeAction,
  openBillingPortalAction,
} from "@/lib/actions";
import type { PlanTier, Subscription } from "@/lib/data/types";

// Human-readable labels for the entitlement codes, so the matrix is fully
// driven off PLANS rather than a parallel hand-kept feature list.
const FEATURE_LABEL: Record<Feature, string> = {
  ai_drafts: "AI review & reply drafts",
  campaigns_lite: "Campaigns & automations",
  campaigns_pro: "Campaigns Pro — A/B tests & journeys",
  rank_grid: "Rank Grid geo-maps",
  ai_visibility: "AI Visibility (AEO) tracking",
  multi_location: "Multi-location roll-up",
  white_label: "White-label branding",
  remove_badge: "Remove the Foundly badge",
  gbp_copilot: "GBP Co-Pilot weekly tasks",
};

// What a workspace keeps when it steps down to Free — the honest, celebratory
// promise repeated on the confirm and the confirmation.
const KEEP_ON_FREE = [
  "Your QR codes & review link stay live",
  "Monthly Local Growth Score email",
  "5 AI review drafts every month",
];

/** Bullet lines for a tier card, derived from PLANS (incremental vs the tier below). */
function planHighlights(id: PlanId): string[] {
  const plan = PLANS[id];
  const idx = PLAN_ORDER.indexOf(id);
  const prevId = idx > 0 ? PLAN_ORDER[idx - 1] : undefined;
  if (id === "free" || !prevId) {
    return ["QR codes & review link", "Monthly Score email", "5 AI drafts / month"];
  }
  const prev = PLANS[prevId];
  const lines: string[] = [`Everything in ${prev.name}`];
  if (plan.limits.aiDraftsPerMonth !== prev.limits.aiDraftsPerMonth) {
    lines.push(
      plan.limits.aiDraftsPerMonth === -1
        ? "Unlimited AI drafts"
        : `${plan.limits.aiDraftsPerMonth} AI drafts / month`,
    );
  }
  if (plan.limits.smsCredits !== prev.limits.smsCredits && plan.limits.smsCredits > 0) {
    lines.push(`${plan.limits.smsCredits} SMS credits / month`);
  }
  if (plan.limits.locations !== prev.limits.locations && plan.limits.locations > 1) {
    lines.push(`Up to ${plan.limits.locations} locations`);
  }
  for (const f of plan.features) {
    if (!prev.features.includes(f)) lines.push(FEATURE_LABEL[f]);
  }
  return lines;
}

interface BillingPanelProps {
  /** Effective tier (Growth during a trial) — used to mark the current card. */
  currentTier: PlanTier;
  status: Subscription["status"];
  trialing: boolean;
  currency: "USD" | "CAD";
  defaultInterval: "monthly" | "annual";
}

export function BillingPanel({
  currentTier,
  status,
  trialing,
  currency,
  defaultInterval,
}: BillingPanelProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [interval, setInterval] = useState<"monthly" | "annual">(defaultInterval);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [downgraded, setDowngraded] = useState(false);

  const currentIdx = PLAN_ORDER.indexOf(currentTier);
  const currentName = PLANS[currentTier as PlanId]?.name ?? "your plan";
  const paused = status === "paused";

  const priceFor = (id: PlanId) =>
    interval === "annual" ? PLANS[id].priceAnnualMonthly : PLANS[id].priceMonthly;
  const annualSaving = (id: PlanId) =>
    (PLANS[id].priceMonthly - PLANS[id].priceAnnualMonthly) * 12;

  // ── Upgrades: honest Stripe checkout, never a faked success ──────────────
  function checkout(id: PlanId) {
    setBusyId(id);
    startTransition(async () => {
      const res = await startCheckoutAction("STRIPE_PRICE_" + id.toUpperCase());
      setBusyId(null);
      if (res.ok) {
        window.location.href = res.url;
        return;
      }
      toast(res.message, "warning", "credit-card");
    });
  }

  // ── Lateral / paid-tier moves ────────────────────────────────────────────
  function switchPlan(id: PlanId) {
    setBusyId(id);
    startTransition(async () => {
      await changePlanAction(id);
      setBusyId(null);
      toast(`Switched to ${PLANS[id].name}`, "success", "check-circle");
      router.refresh();
    });
  }

  function pausePlan() {
    setBusyId("pause");
    startTransition(async () => {
      await pauseSubscriptionAction();
      setBusyId(null);
      toast("Plan paused — nothing is deleted", "info", "clock");
      router.refresh();
    });
  }

  function openPortal() {
    setBusyId("portal");
    startTransition(async () => {
      const res = await openBillingPortalAction();
      setBusyId(null);
      if (res.ok) {
        window.location.href = res.url;
        return;
      }
      toast(res.message, "warning", "credit-card");
    });
  }

  // ── Celebratory downgrade: confirm → action → confirmation ───────────────
  function confirmDowngrade() {
    setBusyId("downgrade");
    startTransition(async () => {
      await downgradeToFreeAction();
      setBusyId(null);
      setConfirmOpen(false);
      setDowngraded(true); // optimistic — the refresh reconciles the server view
      router.refresh();
    });
  }

  return (
    <>
      {/* Paused banner — never a locked door; reactivate or step down to Free. */}
      {paused ? (
        <Card className="border-gold/40 bg-gold-tint/40">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-gold-tint text-gold-deep">
                <Icon name="clock" size={20} />
              </div>
              <div>
                <div className="text-[15px] font-bold text-ink">Your {currentName} plan is paused</div>
                <p className="mt-0.5 text-[13px] text-sub">
                  Billing is on hold and nothing is deleted. Reactivate whenever you&apos;re ready.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                size="sm"
                icon="refresh"
                loading={busyId === (currentTier as string)}
                onClick={() => checkout(currentTier as PlanId)}
              >
                Reactivate {currentName}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmOpen(true)}
              >
                Switch to Free
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {/* ── Plan matrix ─────────────────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[16px] font-bold text-ink">Plans</div>
          <IntervalToggle value={interval} onChange={setInterval} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            const idx = PLAN_ORDER.indexOf(id);
            const isCurrent = id === currentTier;
            const isUpgrade = idx > currentIdx;
            const anchor = !!plan.anchor;
            const price = priceFor(id);
            const saving = annualSaving(id);

            return (
              <div
                key={id}
                className={cn(
                  "relative flex flex-col rounded-card border bg-card p-5 shadow-sm",
                  anchor ? "border-primary ring-2 ring-primary/20" : "border-hairline",
                  isCurrent && "ring-2 ring-primary/40",
                )}
              >
                {anchor ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge tone="gold" icon="star">Most popular</Badge>
                  </div>
                ) : null}

                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[15px] font-bold text-ink">{plan.name}</span>
                  {isCurrent ? (
                    <Badge tone="primary" icon="check-circle">
                      {trialing ? "Trial" : "Current"}
                    </Badge>
                  ) : null}
                </div>

                <div className="mb-2 flex items-end gap-1">
                  <span className="text-[30px] font-extrabold tabular-nums text-ink">
                    {price === 0 ? "Free" : formatMoney(price, currency)}
                  </span>
                  {price === 0 ? null : (
                    <span className="mb-1 text-[13px] text-faint">/mo</span>
                  )}
                </div>
                <div className="mb-3 h-4 text-[12px] font-semibold text-primary">
                  {interval === "annual" && saving > 0
                    ? `Save ${formatMoney(saving, currency)}/yr`
                    : ""}
                </div>

                <p className="mb-4 text-[13px] text-sub">{plan.blurb}</p>

                <ul className="mb-5 flex-1 space-y-2">
                  {planHighlights(id).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-ink/90">
                      <Icon name="check" size={16} className="mt-0.5 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>

                <PlanCta
                  isCurrent={isCurrent}
                  isUpgrade={isUpgrade}
                  isFree={id === "free"}
                  anchor={anchor}
                  name={plan.name}
                  loading={busyId === id}
                  disabled={pending && busyId !== id}
                  onUpgrade={() => checkout(id)}
                  onSwitch={() => switchPlan(id)}
                  onDowngrade={() => setConfirmOpen(true)}
                />
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[12px] text-faint">
          Prices in {currency}. Upgrades open secure Stripe checkout — you&apos;re only charged when you
          confirm there.
        </p>
      </div>

      {/* ── Manage & step-back ──────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Manage & billing"
          kicker="No lock-in"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon="credit-card"
            loading={busyId === "portal"}
            onClick={openPortal}
          >
            Manage payment & invoices
          </Button>
          {!paused && currentTier !== "free" ? (
            <Button
              variant="ghost"
              icon="clock"
              loading={busyId === "pause"}
              onClick={pausePlan}
            >
              Pause plan
            </Button>
          ) : null}
          {currentTier !== "free" ? (
            <Button
              variant="ghost"
              icon="leaf"
              onClick={() => setConfirmOpen(true)}
            >
              Pause or downgrade to Free
            </Button>
          ) : null}
        </div>
        <p className="mt-3 max-w-[70ch] text-[13px] text-faint">
          Pausing holds billing with nothing deleted. Downgrading keeps you on a real Free plan —
          your printed QR codes keep redirecting to Google for 90 days, and your data is always
          yours to export.
        </p>
      </Card>

      {/* ── Confirm downgrade (honest, no dark pattern) ─────────────────── */}
      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="downgrade-title"
          className="fixed inset-0 z-[70] grid place-items-center bg-ink/40 p-4"
          onClick={() => !pending && setConfirmOpen(false)}
        >
          <Card raised className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-btn bg-primary-tint text-primary-dark">
                <Icon name="leaf" size={18} />
              </div>
              <h2 id="downgrade-title" className="text-[17px] font-bold text-ink">
                Switch to Free?
              </h2>
            </div>
            <p className="text-[14px] text-sub">
              No lock-in and nothing is deleted. Here&apos;s exactly what changes.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-primary-dark">
                  You keep
                </div>
                <ul className="space-y-1.5">
                  {KEEP_ON_FREE.map((k) => (
                    <li key={k} className="flex items-start gap-2 text-[13px] text-ink">
                      <Icon name="check" size={15} className="mt-0.5 shrink-0 text-primary" />
                      {k}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-faint">
                  What pauses
                </div>
                <ul className="space-y-1.5">
                  {["GBP Co-Pilot & weekly tasks", "Benchmark, campaigns & SMS", "Rank Grid and AI Visibility"].map(
                    (p) => (
                      <li key={p} className="flex items-start gap-2 text-[13px] text-sub">
                        <Icon name="clock" size={15} className="mt-0.5 shrink-0 text-faint" />
                        {p}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            </div>

            <p className="mt-4 text-[12px] text-faint">
              Upgrade anytime and everything switches back on exactly where you left it.
            </p>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={pending}>
                Never mind, keep {currentName}
              </Button>
              <Button
                variant="primary"
                icon="leaf"
                loading={busyId === "downgrade"}
                onClick={confirmDowngrade}
              >
                Yes, switch to Free
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {/* ── Celebratory downgrade confirmation ──────────────────────────── */}
      {downgraded ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/40 p-4">
          <Confetti fire />
          <Card raised className="w-full max-w-md text-center">
            <div className="mx-auto mb-3 grid size-14 place-items-center rounded-card bg-primary-tint text-primary-dark">
              <Icon name="check-circle" size={28} />
            </div>
            <h2 className="text-[20px] font-extrabold text-ink">You&apos;re on Free</h2>
            <p className="mx-auto mt-1 max-w-xs text-[14px] text-sub">
              You keep your QR, review link, monthly Score, and 5 AI drafts/month.
            </p>
            <ul className="mx-auto mt-4 max-w-xs space-y-2 text-left">
              {KEEP_ON_FREE.map((k) => (
                <li key={k} className="flex items-start gap-2 text-[13px] text-ink">
                  <Icon name="check" size={15} className="mt-0.5 shrink-0 text-primary" />
                  {k}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-faint">
              Upgrade anytime — everything switches back on where you left it.
            </p>
            <Button className="mt-5" fullWidth icon="check" onClick={() => setDowngraded(false)}>
              Done
            </Button>
          </Card>
        </div>
      ) : null}
    </>
  );
}

// ── Monthly ⇄ annual toggle ────────────────────────────────────────────────
function IntervalToggle({
  value,
  onChange,
}: {
  value: "monthly" | "annual";
  onChange: (v: "monthly" | "annual") => void;
}) {
  return (
    <div
      className="inline-flex items-center rounded-chip border border-hairline bg-card p-0.5 text-[13px] font-semibold"
      role="group"
      aria-label="Billing interval"
    >
      {(["monthly", "annual"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          aria-pressed={value === opt}
          onClick={() => onChange(opt)}
          className={cn(
            "rounded-chip px-3 py-1.5 transition-colors min-h-[36px]",
            value === opt ? "bg-ink text-white" : "text-sub hover:text-ink",
          )}
        >
          {opt === "monthly" ? "Monthly" : "Annual"}
          {opt === "annual" ? (
            <span
              className={cn(
                "ml-1 text-[11px] font-bold",
                value === "annual" ? "text-gold" : "text-gold-deep",
              )}
            >
              save
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

// ── Per-card call to action ────────────────────────────────────────────────
function PlanCta({
  isCurrent,
  isUpgrade,
  isFree,
  anchor,
  name,
  loading,
  disabled,
  onUpgrade,
  onSwitch,
  onDowngrade,
}: {
  isCurrent: boolean;
  isUpgrade: boolean;
  isFree: boolean;
  anchor: boolean;
  name: string;
  loading: boolean;
  disabled: boolean;
  onUpgrade: () => void;
  onSwitch: () => void;
  onDowngrade: () => void;
}) {
  if (isCurrent) {
    return (
      <Button variant="secondary" fullWidth disabled>
        Current plan
      </Button>
    );
  }
  if (isUpgrade) {
    return (
      <Button
        variant={anchor ? "primary" : "secondary"}
        fullWidth
        loading={loading}
        disabled={disabled}
        onClick={onUpgrade}
      >
        {anchor ? `Choose ${name}` : `Upgrade to ${name}`}
      </Button>
    );
  }
  // Downgrade
  if (isFree) {
    return (
      <Button variant="ghost" fullWidth disabled={disabled} onClick={onDowngrade}>
        Downgrade to Free
      </Button>
    );
  }
  return (
    <Button variant="ghost" fullWidth loading={loading} disabled={disabled} onClick={onSwitch}>
      Switch to {name}
    </Button>
  );
}
