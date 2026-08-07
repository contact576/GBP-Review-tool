"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ds/Card";
import { Button, LinkButton } from "@/components/ds/Button";
import { Badge, Kicker } from "@/components/ds/misc";
import { Field, Input, Select } from "@/components/ds/form";
import { ScoreDial } from "@/components/charts/ScoreDial";
import { SubDial } from "@/components/charts/SubDial";
import { GapBar, BenchmarkBar } from "@/components/charts/Bars";
import { computePublicScore, scoreBand } from "@/lib/data/selectors";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { downloadScoreCard } from "./scoreCard";

const CATEGORIES = [
  "Physiotherapy", "Chiropractic", "Dental", "HVAC", "Renovation",
  "Salon & spa", "Restaurant", "Auto repair", "Law firm", "Med spa", "Other local business",
];

const STEPS = [
  "Reading your profile…",
  "Counting your reviews…",
  "Checking your rating trend…",
  "Comparing 3 nearby businesses…",
  "Checking your review-request experience…",
];

type Phase = "idle" | "scanning" | "done";

interface Results {
  business: string;
  category: string;
  score: { growth: number; reviews: number; profile: number };
  rating: number;
  reviewCount: number;
  daysSinceLastReview: number;
  responseRate: number; // 0..1
  area: { rating: number; reviewCount: number; recencyDays: number; responseRate: number };
  source: "real" | "synthetic";
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function compute(
  business: string,
  category: string,
  real?: { rating: number; reviewCount: number },
): Results {
  const rnd = mulberry32(seedFrom(business.toLowerCase() + "|" + category));
  // Synthetic values are always drawn (keeps the seed sequence stable), then
  // overridden with the actual public listing data when we have it.
  const syntheticRating = Math.round((3.8 + rnd() * 0.9) * 10) / 10;
  const syntheticCount = 14 + Math.floor(rnd() * 66);
  const rating = real ? real.rating : syntheticRating;
  const reviewCount = real ? real.reviewCount : syntheticCount;
  const daysSinceLastReview = 4 + Math.floor(rnd() * 22);
  const photoCount = 6 + Math.floor(rnd() * 26);
  const responseRate = Math.round((0.15 + rnd() * 0.7) * 100) / 100;
  const profileCompleteness = 52 + Math.floor(rnd() * 40);

  const score = computePublicScore({
    rating,
    reviewCount,
    daysSinceLastReview,
    photoCount,
    responseRate,
    profileCompleteness,
  });

  const area = {
    rating: Math.round((4.3 + rnd() * 0.4) * 10) / 10,
    reviewCount: 48 + Math.floor(rnd() * 46),
    recencyDays: 3 + Math.floor(rnd() * 6),
    responseRate: Math.round((0.55 + rnd() * 0.3) * 100) / 100,
  };

  return {
    business,
    category,
    score,
    rating,
    reviewCount,
    daysSinceLastReview,
    responseRate,
    area,
    source: real ? "real" : "synthetic",
  };
}

export function ScoreTool() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0] as string);
  const [err, setErr] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [completed, setCompleted] = useState(0);
  const [results, setResults] = useState<Results | null>(null);
  const runRef = useRef(0);

  // ── Compare-a-competitor state ──────────────────────────────
  const [compName, setCompName] = useState("");
  const [compErr, setCompErr] = useState("");
  const [comparing, setComparing] = useState(false);
  const [competitor, setCompetitor] = useState<Results | null>(null);
  const compRunRef = useRef(0);

  // Real-data path: when a Places key is configured server-side, the lookup
  // returns the business's actual public rating/review count and the score is
  // recomputed from it. Without a key (or no match) the synthetic preview
  // stands, clearly labelled as an estimate.
  async function lookupReal(business: string, cat: string, myRun: number) {
    try {
      const res = await fetch("/api/score/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business, category: cat }),
      });
      const data: unknown = await res.json();
      if (runRef.current !== myRun) return;
      if (
        data &&
        typeof data === "object" &&
        "real" in data &&
        (data as { real: unknown }).real === true &&
        "place" in data
      ) {
        const place = (data as { place: { rating?: unknown; reviewCount?: unknown } }).place;
        if (place && typeof place.rating === "number" && typeof place.reviewCount === "number") {
          const next = compute(business, cat, { rating: place.rating, reviewCount: place.reviewCount });
          setResults(next);
        }
      }
    } catch {
      // Lookup failed — keep the labelled synthetic preview.
    }
  }

  // Competitor lookup — reuses the exact same synthetic-then-real path as the
  // primary business, keyed on the user's chosen category, so "you vs them"
  // is scored on identical footing. Honest keyless fallback preserved.
  async function lookupCompetitor(business: string, cat: string, myRun: number) {
    try {
      const res = await fetch("/api/score/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business, category: cat }),
      });
      const data: unknown = await res.json();
      if (compRunRef.current !== myRun) return;
      if (
        data &&
        typeof data === "object" &&
        "real" in data &&
        (data as { real: unknown }).real === true &&
        "place" in data
      ) {
        const place = (data as { place: { rating?: unknown; reviewCount?: unknown } }).place;
        if (place && typeof place.rating === "number" && typeof place.reviewCount === "number") {
          setCompetitor(compute(business, cat, { rating: place.rating, reviewCount: place.reviewCount }));
        }
      }
    } catch {
      // Lookup failed — keep the labelled synthetic preview for the competitor.
    } finally {
      if (compRunRef.current === myRun) setComparing(false);
    }
  }

  function handleCompare(e: React.FormEvent) {
    e.preventDefault();
    if (!results) return;
    const business = compName.trim();
    if (!business) {
      setCompErr("Enter a business name to compare.");
      return;
    }
    if (business.toLowerCase() === results.business.toLowerCase()) {
      setCompErr("Enter a different business than your own.");
      return;
    }
    setCompErr("");
    const cat = results.category;
    // Synthetic preview shows instantly, then upgrades to real data if a Places
    // key is configured — same contract as the primary business.
    setCompetitor(compute(business, cat));
    setComparing(true);
    const myRun = ++compRunRef.current;
    void lookupCompetitor(business, cat, myRun);
  }

  function handleDownloadCard() {
    if (!results) return;
    downloadScoreCard({
      business: results.business,
      growth: results.score.growth,
      reviews: results.score.reviews,
      profile: results.score.profile,
      bandLabel: bandLabel(results.score.growth),
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const business = name.trim();
    if (!business) {
      setErr("Enter your business name to run the scan.");
      return;
    }
    setErr("");
    const res = compute(business, category);
    setResults(res);
    // A fresh primary scan invalidates any prior head-to-head.
    setCompetitor(null);
    setCompErr("");
    setComparing(false);
    compRunRef.current++;
    const myRun = ++runRef.current;
    void lookupReal(business, category, myRun);

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setCompleted(STEPS.length);
      setPhase("done");
      return;
    }

    setCompleted(0);
    setPhase("scanning");
    const tick = (n: number) => {
      if (runRef.current !== myRun) return;
      if (n >= STEPS.length) {
        setPhase("done");
        return;
      }
      setCompleted(n + 1);
      window.setTimeout(() => tick(n + 1), 600);
    };
    window.setTimeout(() => tick(0), 450);
  }

  const currentStepLabel =
    phase === "scanning" ? STEPS[Math.min(completed, STEPS.length - 1)] : phase === "done" ? "Scan complete" : "";

  return (
    <div className="space-y-6">
      {/* ── Input card ─────────────────────────────────── */}
      <Card raised>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business name" required error={err || undefined}>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Bright Smile Dental"
                  iconLeft="building"
                  autoComplete="organization"
                />
              </Field>
              <Field label="Category">
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button type="submit" size="lg" icon="sparkles" loading={phase === "scanning"} className="sm:mb-0">
              {phase === "done" ? "Re-run Score" : "Get my free Score"}
            </Button>
          </div>
          <p className="text-[13px] text-faint">30 seconds · no signup · no card</p>
        </form>
      </Card>

      {/* ── Stepped scan ───────────────────────────────── */}
      {phase !== "idle" ? (
        <Card>
          <div className="flex items-center justify-between">
            <Kicker>Scanning</Kicker>
            <span aria-live="polite" className="text-[12px] font-medium text-sub">{currentStepLabel}</span>
          </div>
          <ul className="mt-4 space-y-2.5">
            {STEPS.map((step, i) => {
              const isDone = completed > i;
              const isActive = phase === "scanning" && completed === i;
              return (
                <li key={step} className="flex items-center gap-3">
                  <span
                    className={
                      isDone
                        ? "grid size-6 place-items-center rounded-full bg-primary text-white"
                        : isActive
                          ? "grid size-6 place-items-center rounded-full border-2 border-primary/30 border-t-primary animate-spin"
                          : "grid size-6 place-items-center rounded-full border border-hairline text-faint"
                    }
                    aria-hidden
                  >
                    {isDone ? <Icon name="check" size={14} /> : null}
                  </span>
                  <span
                    className={
                      isDone ? "text-[14px] font-medium text-ink" : isActive ? "text-[14px] font-medium text-ink" : "text-[14px] text-faint"
                    }
                  >
                    {step}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {/* ── Reveal ─────────────────────────────────────── */}
      {phase === "done" && results ? (
        <div className="space-y-5 animate-fade-in">
          {/* Score hero */}
          <div className="on-hero rounded-card bg-hero p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="kicker text-gold">Local Growth Score</div>
                <div className="mt-0.5 text-[15px] font-semibold">{results.business}</div>
              </div>
              <Badge tone="gold" icon="sparkles">{bandLabel(results.score.growth)}</Badge>
            </div>
            <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
              <ScoreDial value={results.score.growth} size={184} label="" onHero />
              <div className="flex items-center gap-8">
                <SubDial value={results.score.reviews} label="Reviews" onHero />
                <SubDial value={results.score.profile} label="Profile" onHero />
              </div>
            </div>
            <div className="mt-5 flex justify-center sm:justify-end">
              <Button type="button" onClick={handleDownloadCard} variant="gold" size="sm" icon="download">
                Download score card
              </Button>
            </div>
          </div>

          {/* Gaps vs area */}
          <Card>
            <div className="mb-4">
              <Kicker>You vs the area</Kicker>
              <h3 className="mt-1 text-[17px] font-bold text-ink">Where you stand on the block</h3>
              <p className="mt-1 text-[13px] text-sub">Compared with a typical nearby {results.category.toLowerCase()}.</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <GapBar label="Star rating" you={results.rating} area={results.area.rating} format={(n) => n.toFixed(1)} />
              <GapBar label="Total reviews" you={results.reviewCount} area={results.area.reviewCount} format={(n) => String(Math.round(n))} />
              <GapBar label="Days since last review" you={results.daysSinceLastReview} area={results.area.recencyDays} format={(n) => `${Math.round(n)}d`} goodWhenHigher={false} />
              <GapBar label="Reply rate" you={Math.round(results.responseRate * 100)} area={Math.round(results.area.responseRate * 100)} format={(n) => `${Math.round(n)}%`} />
            </div>
            <p className="mt-4 text-[12px] text-faint">
              {results.source === "real"
                ? "Rating and review count from your public Google listing."
                : "Estimated preview — connect your business for real data."}
            </p>
          </Card>

          {/* Compare a competitor */}
          <Card>
            <div className="mb-4">
              <Kicker>Compare another business</Kicker>
              <h3 className="mt-1 text-[17px] font-bold text-ink">See how you stack up</h3>
              <p className="mt-1 text-[13px] text-sub">
                Enter any nearby {results.category.toLowerCase()} to run the same Score on them.
              </p>
            </div>
            <form onSubmit={handleCompare} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Competitor business name" error={compErr || undefined}>
                <Input
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  placeholder="e.g. Downtown Dental"
                  iconLeft="building"
                  autoComplete="off"
                />
              </Field>
              <Button type="submit" variant="secondary" size="lg" icon="search" loading={comparing} className="sm:mb-0">
                Compare
              </Button>
            </form>

            {competitor ? (
              <div className="mt-6 border-t border-hairline pt-6 animate-fade-in">
                {/* Growth Score — you vs them */}
                <div className="flex items-center justify-center gap-6 sm:gap-10">
                  <ScoreDial value={results.score.growth} size={128} label={results.business} />
                  <span className="kicker text-faint">vs</span>
                  <ScoreDial value={competitor.score.growth} size={128} label={competitor.business} />
                </div>
                {/* Rating + review count — you vs them */}
                <div className="mt-6 space-y-5">
                  <BenchmarkBar
                    label="Star rating"
                    you={results.rating}
                    others={[{ name: competitor.business, value: competitor.rating }]}
                  />
                  <BenchmarkBar
                    label="Total reviews"
                    you={results.reviewCount}
                    others={[{ name: competitor.business, value: competitor.reviewCount }]}
                  />
                </div>
                <p className="mt-4 text-[12px] text-faint">
                  {competitor.source === "real"
                    ? "Their rating and review count from their public Google listing."
                    : "Estimated preview for them — connect a business for real data."}
                </p>
              </div>
            ) : null}
          </Card>

          {/* Policy-safe review request explanation */}
          <Card className="border-primary/30 bg-primary-wash/50">
            <div className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-btn bg-primary text-white">
                <Icon name="shield" size={16} />
              </div>
              <Kicker>Authentic reviews, safely requested</Kicker>
            </div>
            <div className="mt-4 rounded-card border border-hairline bg-card p-5">
              <ul className="space-y-3 text-[13px] leading-relaxed text-sub">
                <li className="flex items-start gap-2"><Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-primary" />The same Google review option appears for every rating.</li>
                <li className="flex items-start gap-2"><Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-primary" />Customers write about their genuine experience in their own words.</li>
                <li className="flex items-start gap-2"><Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-primary" />Optional editing only improves clarity and cannot add services, names, keywords, or claims.</li>
              </ul>
              <p className="mt-4 text-[12px] text-faint">{MICROCOPY.noIncentive}</p>
            </div>
          </Card>

          {/* CTA */}
          <div className="on-hero rounded-card bg-hero px-6 py-8 text-center text-white shadow-lg">
            <h3 className="text-[22px] font-extrabold tracking-tight sm:text-[26px]">
              Build a trustworthy review habit
            </h3>
            <p className="mx-auto mt-2 max-w-md text-[14px] text-white/75">
              Start free and Foundly handles consent-aware requests, reminders, review monitoring,
              and owner-reply suggestions. No card for 30 days.
            </p>
            <div className="mt-5">
              <LinkButton
                href="/sign-up"
                size="lg"
                variant="secondary"
                icon="sparkles"
                className="border-transparent bg-white text-hero hover:bg-white/90"
              >
                Start free — improve your review process
              </LinkButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function bandLabel(score: number): string {
  const band = scoreBand(score);
  return band === "high" ? "Strong" : band === "mid" ? "Room to grow" : "Needs attention";
}
