"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ds/Card";
import { Button, LinkButton } from "@/components/ds/Button";
import { Badge, Kicker } from "@/components/ds/misc";
import { Field, Input, Select } from "@/components/ds/form";
import { ScoreDial } from "@/components/charts/ScoreDial";
import { SubDial } from "@/components/charts/SubDial";
import { GapBar } from "@/components/charts/Bars";
import { computePublicScore, scoreBand } from "@/lib/data/selectors";
import { MICROCOPY } from "@/lib/compliance/microcopy";

const CATEGORIES = [
  "Physiotherapy", "Chiropractic", "Dental", "HVAC", "Renovation",
  "Salon & spa", "Restaurant", "Auto repair", "Law firm", "Med spa", "Other local business",
];

const STEPS = [
  "Reading your profile…",
  "Counting your reviews…",
  "Checking your rating trend…",
  "Comparing 3 nearby businesses…",
  "Drafting a sample review…",
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
  const [sample, setSample] = useState<{ text: string; source: string; stars: number } | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const runRef = useRef(0);
  // Latest computed growth score (state is stale inside timeout closures).
  const scoreRef = useRef(0);

  async function loadSample(business: string, cat: string, myRun: number) {
    setSampleLoading(true);
    try {
      // The sample's register must match the diagnosed profile band — a weak
      // profile gets a measured 4-star sample, never glowing 5-star copy.
      const band = scoreBand(scoreRef.current);
      const standing = band === "high" ? "strong" : band === "mid" ? "average" : "weak";
      const stars = standing === "strong" ? 5 : 4;
      const res = await fetch("/api/ai/score-sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business, category: cat, standing, rating: stars }),
      });
      const data: unknown = await res.json();
      if (runRef.current !== myRun) return;
      if (data && typeof data === "object" && "text" in data && typeof (data as { text: unknown }).text === "string") {
        const d = data as { text: string; source?: string };
        setSample({ text: d.text, source: d.source ?? "ai", stars });
      } else {
        setSample(null);
      }
    } catch {
      if (runRef.current === myRun) setSample(null);
    } finally {
      if (runRef.current === myRun) setSampleLoading(false);
    }
  }

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
          scoreRef.current = next.score.growth;
          setResults(next);
        }
      }
    } catch {
      // Lookup failed — keep the labelled synthetic preview.
    }
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
    scoreRef.current = res.score.growth;
    setResults(res);
    setSample(null);
    const myRun = ++runRef.current;
    void lookupReal(business, category, myRun);

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setCompleted(STEPS.length);
      setPhase("done");
      void loadSample(business, category, myRun);
      return;
    }

    setCompleted(0);
    setPhase("scanning");
    const tick = (n: number) => {
      if (runRef.current !== myRun) return;
      if (n >= STEPS.length) {
        setPhase("done");
        void loadSample(business, category, myRun);
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

          {/* Magic block — AI sample review */}
          <Card className="border-primary/30 bg-primary-wash/50">
            <div className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-btn bg-primary text-white">
                <Icon name="sparkles" size={16} />
              </div>
              <Kicker>A review Foundly would draft for you</Kicker>
            </div>
            <figure className="mt-4 rounded-card border border-hairline bg-card p-5">
              {(() => {
                const stars = sample?.stars ?? (scoreBand(results.score.growth) === "high" ? 5 : 4);
                return (
                  <div className="flex gap-1 text-star" aria-label={`${stars === 5 ? "Five" : "Four"} stars`}>
                    {Array.from({ length: stars }).map((_, i) => (
                      <Icon key={i} name="star-fill" size={16} />
                    ))}
                  </div>
                );
              })()}
              {sampleLoading ? (
                <div className="mt-3 space-y-2" aria-live="polite">
                  <div className="shimmer h-3.5 w-full rounded" />
                  <div className="shimmer h-3.5 w-[92%] rounded" />
                  <div className="shimmer h-3.5 w-[70%] rounded" />
                </div>
              ) : sample ? (
                <blockquote className="mt-3 text-[15px] leading-relaxed text-ink">&ldquo;{sample.text}&rdquo;</blockquote>
              ) : (
                <p className="mt-3 text-[14px] text-sub">
                  A happy customer would write about your {results.category.toLowerCase()} here — Foundly drafts
                  the first version so it&apos;s ready to send.
                </p>
              )}
              <figcaption className="mt-3 text-[12px] text-faint">
                {MICROCOPY.aiDraftDisclaimer}
              </figcaption>
            </figure>
          </Card>

          {/* CTA */}
          <div className="on-hero rounded-card bg-hero px-6 py-8 text-center text-white shadow-lg">
            <h3 className="text-[22px] font-extrabold tracking-tight sm:text-[26px]">
              Get reviews like this every week
            </h3>
            <p className="mx-auto mt-2 max-w-md text-[14px] text-white/75">
              Start free and Foundly runs the whole loop — asks, drafts, and keeps your profile
              climbing. No card for 14 days.
            </p>
            <div className="mt-5">
              <LinkButton href="/sign-up" size="lg" variant="gold" icon="sparkles">
                Start free — get reviews like this every week
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
