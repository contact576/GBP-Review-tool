"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import type { Region } from "@/lib/data/types";
import { currencySymbol } from "@/lib/utils/region";
import { Icon } from "@/components/icons";
import { LinkButton } from "@/components/ds/Button";
import { Badge, Kicker } from "@/components/ds/misc";
import { PricingTierCard, type Tier } from "@/components/app/PricingTierCard";

function tiers(): Tier[] {
  return [
    {
      name: "Free",
      price: 0,
      cadence: "forever",
      tagline: "Everything you need to start collecting real reviews.",
      cta: "Start free",
      href: "/sign-up",
      features: [
        "QR review kit for your counter",
        "5 AI review drafts / month",
        "Review inbox + reply drafts",
        "Your Local Growth Score",
      ],
    },
    {
      name: "Starter",
      price: 39,
      cadence: "mo",
      tagline: "For a single location getting into a steady rhythm.",
      cta: "Start 14-day trial",
      href: "/sign-up",
      features: [
        "Everything in Free",
        "60 AI review drafts / month",
        "SMS + email review requests",
        "Staff leaderboard & streaks",
        "Weekly email digest",
      ],
    },
    {
      name: "Growth",
      price: 99,
      cadence: "mo",
      tagline: "The full loop, on autopilot — our most popular plan.",
      cta: "Start 14-day trial",
      href: "/sign-up",
      anchor: true,
      features: [
        "Everything in Starter",
        "250 AI review drafts / month",
        "GBP Co-Pilot: 3 tasks a week",
        "Durability watchdog (30 & 60-day)",
        "Consent-based winback campaigns",
        "Monthly Growth Report",
      ],
    },
    {
      name: "Pro",
      price: 179,
      cadence: "mo",
      tagline: "For competitive markets where rank and AI visibility win.",
      cta: "Start 14-day trial",
      href: "/sign-up",
      features: [
        "Everything in Growth",
        "Unlimited AI review drafts",
        "Local rank grid + AEO tracker",
        "AI-visibility monitoring",
        "Priority support",
        "API & webhooks",
      ],
    },
  ];
}

export function PricingBoard() {
  const [annual, setAnnual] = useState(false);
  const [region, setRegion] = useState<Region>("CA");
  const symbol = currencySymbol(region);

  return (
    <div className="space-y-8">
      {/* Reverse-trial explainer */}
      <div className="mx-auto max-w-2xl rounded-card border border-primary/25 bg-primary-wash p-5 text-center">
        <div className="flex items-center justify-center gap-2">
          <Icon name="gift" size={18} className="text-primary" />
          <span className="text-[14px] font-bold text-ink">14 days of Growth, free</span>
        </div>
        <p className="mt-1.5 text-[13px] text-sub">
          Start on the full Growth plan with no credit card. When the trial ends, keep a free plan
          forever — nothing auto-charges, nothing disappears.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
        <Segmented
          options={[{ key: "monthly", label: "Monthly" }, { key: "annual", label: "Annual · 2 months free" }]}
          value={annual ? "annual" : "monthly"}
          onChange={(k) => setAnnual(k === "annual")}
        />
        <Segmented
          options={[{ key: "CA", label: "CA$" }, { key: "US", label: "US$" }]}
          value={region}
          onChange={(k) => setRegion(k as Region)}
        />
      </div>

      {/* Core tiers */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {tiers().map((t) => (
          <PricingTierCard key={t.name} tier={t} currencySymbol={symbol} annual={annual} />
        ))}
      </div>

      {/* Teams & agencies band */}
      <div className="rounded-card border border-hairline bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Kicker>Teams &amp; agencies</Kicker>
            <h3 className="mt-1 text-[20px] font-extrabold tracking-tight text-ink">Running more than one location?</h3>
          </div>
          <Link href="/agencies" className="inline-flex items-center gap-1 text-[14px] font-semibold text-primary hover:text-primary-dark">
            Explore the agency program <Icon name="arrow-right" size={16} />
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
          <BandCard
            title="Multi-location"
            price={`${symbol}69–99`}
            unit="/location · mo"
            tagline="One dashboard across every location, with roll-up reporting."
            features={[
              "All Growth features per location",
              "Central multi-location dashboard",
              "Per-location scores & benchmarks",
              "Consolidated monthly reporting",
            ]}
            cta="Start a team trial"
            href="/sign-up"
          />
          <BandCard
            title="Agency"
            price={`${symbol}299`}
            unit="+ · mo"
            tagline="White-label Foundly and resell it to local clients under your brand."
            features={[
              "White-label brand, colors & domain",
              "Wholesale per-client pricing",
              "Client Growth-Report engine",
              "Unlimited team seats",
            ]}
            cta="Start as an agency"
            href="/sign-in"
            highlight
          />
        </div>
      </div>

      <p className="text-center text-[13px] text-faint">
        Prices in {region === "CA" ? "Canadian" : "US"} dollars, billed {annual ? "annually" : "monthly"}. No fake urgency, no
        setup fees — change or cancel anytime.
      </p>
    </div>
  );
}

function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
}) {
  return (
    <div className="inline-flex rounded-chip border border-hairline bg-card p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={cn(
            "rounded-chip px-4 py-1.5 text-[13px] font-semibold transition-colors min-h-[44px]",
            value === o.key ? "bg-primary text-white" : "text-sub hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function BandCard({
  title, price, unit, tagline, features, cta, href, highlight,
}: {
  title: string; price: string; unit: string; tagline: string;
  features: string[]; cta: string; href: string; highlight?: boolean;
}) {
  return (
    <div className={cn("flex flex-col rounded-card border bg-paper p-5", highlight ? "border-primary/40" : "border-hairline")}>
      <div className="flex items-center justify-between">
        <div className="text-[15px] font-bold text-ink">{title}</div>
        {highlight ? <Badge tone="gold" icon="building">Resell it</Badge> : null}
      </div>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-[26px] font-extrabold tabular-nums text-ink">{price}</span>
        <span className="mb-1 text-[13px] text-faint">{unit}</span>
      </div>
      <p className="mt-2 text-[13px] text-sub">{tagline}</p>
      <ul className="mt-4 flex-1 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[13px] text-ink/90">
            <Icon name="check" size={16} className="mt-0.5 shrink-0 text-primary" />
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-5">
        <LinkButton href={href} variant={highlight ? "primary" : "secondary"} fullWidth>{cta}</LinkButton>
      </div>
    </div>
  );
}
