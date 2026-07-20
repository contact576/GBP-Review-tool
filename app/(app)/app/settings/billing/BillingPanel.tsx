"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Card, CardHeader } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Table, type Column } from "@/components/ds/Table";
import { useToast } from "@/components/ds/Toast";
import { Icon } from "@/components/icons";
import { Confetti } from "@/components/review/Confetti";
import { formatMoney, formatNumber } from "@/lib/utils/format";
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

// Order the comparison table walks the entitlement codes in — cheapest-tier
// features first so the rows read as a rising ladder.
const COMPARE_FEATURES: Feature[] = [
  "ai_drafts",
  "campaigns_lite",
  "gbp_copilot",
  "remove_badge",
  "campaigns_pro",
  "rank_grid",
  "ai_visibility",
  "multi_location",
  "white_label",
];

// What a workspace keeps when it steps down to Free — the honest, celebratory
// promise repeated on the confirm and the confirmation.
const KEEP_ON_FREE = [
  "Your QR codes & review link stay live",
  "Monthly Local Growth Score email",
  "5 AI review drafts every month",
];

/** Blurb with any legacy "Most popular" claim stripped — the deep-green tier
 *  carries that signal structurally now, no hype copy. */
function planBlurb(id: PlanId): string {
  return PLANS[id].blurb.replace(/\s*Most popular\.?\s*$/i, "").trim();
}

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

  // Headline annual discount for the toggle badge — the largest honest figure
  // across paid tiers, phrased "up to" so it never overstates a cheaper plan.
  const maxSavePct = Math.max(
    ...PLAN_ORDER.filter((id) => PLANS[id].priceMonthly > 0).map((id) =>
      Math.round((1 - PLANS[id].priceAnnualMonthly / PLANS[id].priceMonthly) * 100),
    ),
  );

  // ── Upgrades: honest Stripe checkout, never a faked success ──────────────
  function checkout(id: PlanId) {
    setBusyId(id);
    startTransition(async () => {
      const res = await startCheckoutAction(id, interval);
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
      const result = await changePlanAction(id);
      setBusyId(null);
      if (result.ok) {
        if ("url" in result) {
          window.location.href = result.url;
          return;
        }
        toast(`Switched to ${PLANS[id].name}`, "success", "check-circle");
        router.refresh();
      } else {
        toast(result.message, "warning", "credit-card");
      }
    });
  }

  function pausePlan() {
    setBusyId("pause");
    startTransition(async () => {
      const result = await pauseSubscriptionAction();
      setBusyId(null);
      if (result.ok) {
        if ("url" in result) {
          window.location.href = result.url;
          return;
        }
        toast("Plan paused — nothing is deleted", "info", "clock");
        router.refresh();
      } else {
        toast(result.message, "warning", "credit-card");
      }
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
      const result = await downgradeToFreeAction();
      setBusyId(null);
      if (result.ok) {
        if ("url" in result) {
          window.location.href = result.url;
          return;
        }
        setConfirmOpen(false);
        setDowngraded(true);
        router.refresh();
      } else {
        toast(result.message, "warning", "credit-card");
      }
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
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="kicker mb-1">Plans</div>
            <div className="text-[18px] font-bold text-ink">Pick what fits — change anytime</div>
          </div>
          <IntervalToggle value={interval} onChange={setInterval} savePct={maxSavePct} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            const idx = PLAN_ORDER.indexOf(id);
            const isCurrent = id === currentTier;
            const isUpgrade = idx > currentIdx;
            const anchor = !!plan.anchor; // featured tier → deep-green polarity flip
            const price = priceFor(id);
            const saving = annualSaving(id);

            return (
              <div
                key={id}
                className={cn(
                  "relative flex flex-col rounded-card p-5 transition-shadow",
                  anchor
                    ? // Deep-green inversion + soft green-wash halo. No ribbon —
                      // the polarity flip is the signal.
                      "on-hero bg-hero text-white shadow-[0_18px_40px_-14px_rgba(12,122,99,0.55)]"
                    : "border border-hairline bg-card shadow-sm",
                  isCurrent && !anchor && "ring-2 ring-primary/35",
                  isCurrent && anchor && "ring-1 ring-white/40",
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className={cn("kicker normal-case", anchor ? "text-white/70" : "text-faint")}>
                    {plan.name}
                  </span>
                  {isCurrent ? (
                    anchor ? (
                      <span className="inline-flex items-center gap-1 rounded-chip bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white">
                        <Icon name="check-circle" size={12} />
                        {trialing ? "Trial" : "Current"}
                      </span>
                    ) : (
                      <Badge tone="primary" icon="check-circle">
                        {trialing ? "Trial" : "Current"}
                      </Badge>
                    )
                  ) : null}
                </div>

                <div className="flex items-baseline gap-1">
                  <span
                    className={cn(
                      "font-extrabold tabular-nums tracking-tight leading-none text-[34px]",
                      anchor ? "text-white" : "text-ink",
                    )}
                  >
                    {price === 0 ? "Free" : formatMoney(price, currency)}
                  </span>
                  {price === 0 ? null : (
                    <span className={cn("text-[13px]", anchor ? "text-white/60" : "text-faint")}>
                      /mo
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "mb-3 mt-1 h-4 text-[12px] font-semibold",
                    anchor ? "text-[#8FE3CE]" : "text-primary",
                  )}
                >
                  {interval === "annual" && saving > 0
                    ? `Save ${formatMoney(saving, currency)}/yr`
                    : ""}
                </div>

                <p className={cn("mb-4 text-[13px]", anchor ? "text-white/70" : "text-sub")}>
                  {planBlurb(id)}
                </p>

                <ul className="mb-5 flex-1 space-y-2">
                  {planHighlights(id).map((f) => (
                    <li
                      key={f}
                      className={cn(
                        "flex items-start gap-2 text-[13px]",
                        anchor ? "text-white/90" : "text-ink/90",
                      )}
                    >
                      <Icon
                        name="check"
                        size={16}
                        className={cn("mt-0.5 shrink-0", anchor ? "text-[#8FE3CE]" : "text-primary")}
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                <PlanCta
                  isCurrent={isCurrent}
                  isUpgrade={isUpgrade}
                  isFree={id === "free"}
                  anchor={anchor}
                  onHero={anchor}
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

        {/* Optional side-by-side comparison — premium hairline ledger. */}
        <PlanComparison interval={interval} currency={currency} />
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

// ── Monthly ⇄ annual segmented pill toggle + quiet green save badge ─────────
function IntervalToggle({
  value,
  onChange,
  savePct,
}: {
  value: "monthly" | "annual";
  onChange: (v: "monthly" | "annual") => void;
  savePct: number;
}) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-chip border border-hairline bg-primary-wash p-1 text-[13px] font-semibold"
      role="group"
      aria-label="Billing interval"
    >
      {(["monthly", "annual"] as const).map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-chip px-3.5 py-1.5 transition-colors min-h-[36px]",
              active ? "bg-card text-ink shadow-sm" : "text-sub hover:text-ink",
            )}
          >
            {opt === "monthly" ? "Monthly" : "Annual"}
            {opt === "annual" && savePct > 0 ? (
              <Badge tone="primary" className="font-bold">
                Save up to {savePct}%
              </Badge>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ── Optional plan comparison — premium hairline ledger ──────────────────────
type CompRow = { key: string; label: string; cell: (id: PlanId) => React.ReactNode };

function IncludedGlyph() {
  return (
    <span className="inline-flex items-center justify-center">
      <Icon name="check" size={16} className="text-primary" aria-hidden />
      <span className="sr-only">Included</span>
    </span>
  );
}

function ExcludedGlyph() {
  return (
    <span className="inline-flex items-center justify-center">
      <span className="text-faint" aria-hidden>
        —
      </span>
      <span className="sr-only">Not included</span>
    </span>
  );
}

function PlanComparison({
  interval,
  currency,
}: {
  interval: "monthly" | "annual";
  currency: "USD" | "CAD";
}) {
  const priceFor = (id: PlanId) =>
    interval === "annual" ? PLANS[id].priceAnnualMonthly : PLANS[id].priceMonthly;

  const rows: CompRow[] = [
    {
      key: "ai_drafts_limit",
      label: "AI drafts / month",
      cell: (id) => (
        <span className="tabular-nums">
          {PLANS[id].limits.aiDraftsPerMonth === -1
            ? "Unlimited"
            : formatNumber(PLANS[id].limits.aiDraftsPerMonth)}
        </span>
      ),
    },
    {
      key: "sms_limit",
      label: "SMS credits / month",
      cell: (id) =>
        PLANS[id].limits.smsCredits > 0 ? (
          <span className="tabular-nums">{formatNumber(PLANS[id].limits.smsCredits)}</span>
        ) : (
          <ExcludedGlyph />
        ),
    },
    {
      key: "locations",
      label: "Locations",
      cell: (id) => (
        <span className="tabular-nums">
          {PLANS[id].limits.locations > 1 ? `Up to ${PLANS[id].limits.locations}` : "1"}
        </span>
      ),
    },
    {
      key: "seats",
      label: "Team seats",
      cell: (id) => <span className="tabular-nums">{formatNumber(PLANS[id].limits.seats)}</span>,
    },
    ...COMPARE_FEATURES.map((f) => ({
      key: f,
      label: FEATURE_LABEL[f],
      cell: (id: PlanId) =>
        PLANS[id].features.includes(f) ? <IncludedGlyph /> : <ExcludedGlyph />,
    })),
  ];

  const columns: Column<CompRow>[] = [
    {
      key: "label",
      header: "Plan",
      width: "40%",
      render: (row) => <span className="font-medium text-ink">{row.label}</span>,
      cellClassName: "whitespace-normal",
    },
    ...PLAN_ORDER.map((id) => {
      const anchor = !!PLANS[id].anchor;
      const price = priceFor(id);
      const col: Column<CompRow> = {
        key: id,
        align: "center",
        ariaLabel: PLANS[id].name,
        header: (
          <div className="flex flex-col items-center gap-0.5">
            <span>{PLANS[id].name}</span>
            <span className="font-sans text-[14px] font-extrabold tabular-nums tracking-tight text-ink">
              {price === 0 ? "Free" : formatMoney(price, currency)}
            </span>
          </div>
        ),
        render: (row) => row.cell(id),
        headerClassName: anchor ? "bg-primary-wash" : undefined,
        cellClassName: anchor ? "bg-primary-wash" : undefined,
      };
      return col;
    }),
  ];

  return (
    <details className="group mt-4">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-btn px-1 py-1 text-[13px] font-semibold text-primary hover:text-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-paper">
        <Icon
          name="chevron-down"
          size={16}
          className="transition-transform group-open:rotate-180"
          aria-hidden
        />
        Compare every plan
      </summary>
      <div className="mt-3">
        <Table<CompRow>
          columns={columns}
          data={rows}
          rowKey={(r) => r.key}
          caption="Feature and limit comparison across every Foundly plan."
        />
        <p className="mt-2 text-[12px] text-faint">
          Prices shown per month{interval === "annual" ? ", billed annually" : ""}, in {currency}.
        </p>
      </div>
    </details>
  );
}

// ── Per-card call to action ────────────────────────────────────────────────
function PlanCta({
  isCurrent,
  isUpgrade,
  isFree,
  anchor,
  onHero,
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
  onHero: boolean;
  name: string;
  loading: boolean;
  disabled: boolean;
  onUpgrade: () => void;
  onSwitch: () => void;
  onDowngrade: () => void;
}) {
  if (isCurrent) {
    return (
      <Button
        variant="secondary"
        fullWidth
        disabled
        className={onHero ? "!border-white/25 !bg-white/15 !text-white" : undefined}
      >
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
        className={
          onHero
            ? "!bg-white !text-primary-dark shadow-sm hover:!bg-white/90 active:!bg-white/90"
            : undefined
        }
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
    <Button
      variant="ghost"
      fullWidth
      loading={loading}
      disabled={disabled}
      onClick={onSwitch}
      className={onHero ? "!text-white hover:!bg-white/10 active:!bg-white/15" : undefined}
    >
      Switch to {name}
    </Button>
  );
}
