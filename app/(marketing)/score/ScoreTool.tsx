"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ds/Card";
import { Button, LinkButton } from "@/components/ds/Button";
import { Badge, Kicker } from "@/components/ds/misc";
import { Field, Input, Select } from "@/components/ds/form";
import { ScoreDial } from "@/components/charts/ScoreDial";
import { SubDial } from "@/components/charts/SubDial";
import { BenchmarkBar } from "@/components/charts/Bars";
import { computePublicScore, scoreBand } from "@/lib/data/selectors";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { downloadScoreCard } from "./scoreCard";

/**
 * Free Local Growth Score.
 *
 * HONESTY CONTRACT — every figure this component renders is read from the
 * business's public Google listing through /api/score/lookup. There is no
 * seeded generator, no estimate, and no placeholder score anywhere in this
 * file. When Google can't answer, the tool says so instead of showing a number.
 *
 * What is genuinely knowable, and therefore shown:
 *   · star rating + total review count  — Google's real aggregates
 *   · days since the newest review      — from the PUBLIC SAMPLE (max 5)
 *   · photo count                       — a FLOOR ("at least N"); Places caps it
 *   · profile completeness              — presence of website/phone/hours/description
 *   · nearby benchmark                  — aggregated from REAL nearby listings
 *
 * What is NOT knowable from public data, and is therefore absent:
 *   · owner reply rate — Google never exposes it publicly, so it is not part
 *     of the public score and is not displayed. (`computePublicScore`
 *     renormalises the profile sub-score without it.)
 */

const CATEGORIES = [
  "Physiotherapy", "Chiropractic", "Dental", "HVAC", "Renovation",
  "Salon & spa", "Restaurant", "Auto repair", "Law firm", "Med spa", "Other local business",
];

/** Each step maps 1:1 to a real phase of work — never to a timer. */
const STEPS = [
  "Finding your listing on Google",
  "Reading your public profile",
  "Checking real businesses nearby",
  "Scoring only what we verified",
];

type Phase = "idle" | "scanning" | "done";

type Unavailable =
  | "no_key"
  | "not_found"
  | "no_location"
  | "no_category"
  | "too_few"
  | "error";

interface PlaceFacts {
  placeId: string;
  name: string;
  address: string;
  rating: number;
  reviewCount: number;
  category: string;
}

interface ProfileSignals {
  /** Days since the newest review in the public sample. `null` = not knowable. */
  daysSinceLastReview: number | null;
  /** How many reviews Google actually returned (at most 5). */
  reviewSampleSize: number;
  /** A FLOOR — Google caps the photos it returns. */
  photoSampleCount: number;
  profileCompleteness: number;
  present: { website: boolean; phone: boolean; hours: boolean; description: boolean };
}

interface NearbyBenchmark {
  sampleSize: number;
  /** Mean star rating across the real nearby listings. */
  rating: number;
  /** Median total review count across the real nearby listings. */
  reviewCount: number;
  radiusMeters: number;
}

interface Score {
  growth: number;
  reviews: number;
  profile: number;
}

type Outcome =
  | { kind: "unavailable"; reason: Unavailable; typed: string }
  | {
      kind: "scored";
      typed: string;
      category: string;
      place: PlaceFacts;
      signals: ProfileSignals;
      score: Score;
      benchmark: NearbyBenchmark | null;
      benchmarkReason: Unavailable | null;
    };

type CompetitorOutcome =
  | { kind: "unavailable"; reason: Unavailable; typed: string }
  | { kind: "scored"; typed: string; place: PlaceFacts; score: Score };

// ── Response parsing (no `any`, no optimistic casts) ────────────────────────

interface LookupResponse {
  status: Unavailable | "ok";
  place: Record<string, unknown> | null;
  signals: Record<string, unknown> | null;
  benchmark: Record<string, unknown> | null;
}

const UNAVAILABLE_STATUSES: Unavailable[] = [
  "no_key", "not_found", "no_location", "no_category", "too_few", "error",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readStatus(value: unknown): Unavailable | "ok" {
  if (value === "ok") return "ok";
  const match = UNAVAILABLE_STATUSES.find((s) => s === value);
  return match ?? "error";
}

async function postLookup(body: Record<string, unknown>): Promise<LookupResponse> {
  const failed: LookupResponse = { status: "error", place: null, signals: null, benchmark: null };
  try {
    const res = await fetch("/api/score/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = asRecord(await res.json());
    if (!res.ok || !raw) return failed;
    return {
      status: readStatus(raw.status),
      place: asRecord(raw.place),
      signals: asRecord(raw.signals),
      benchmark: asRecord(raw.benchmark),
    };
  } catch {
    return failed;
  }
}

function readPlace(raw: Record<string, unknown> | null): PlaceFacts | null {
  if (!raw) return null;
  const placeId = readString(raw.placeId);
  if (!placeId) return null;
  return {
    placeId,
    name: readString(raw.name),
    address: readString(raw.address),
    rating: readNumber(raw.rating),
    reviewCount: readNumber(raw.reviewCount),
    category: readString(raw.category),
  };
}

function readSignals(raw: Record<string, unknown> | null): ProfileSignals | null {
  if (!raw) return null;
  const present = asRecord(raw.present);
  return {
    daysSinceLastReview: readNumberOrNull(raw.daysSinceLastReview),
    reviewSampleSize: readNumber(raw.reviewSampleSize),
    photoSampleCount: readNumber(raw.photoSampleCount),
    profileCompleteness: readNumber(raw.profileCompleteness),
    present: {
      website: present?.website === true,
      phone: present?.phone === true,
      hours: present?.hours === true,
      description: present?.description === true,
    },
  };
}

function readBenchmark(raw: Record<string, unknown> | null): NearbyBenchmark | null {
  if (!raw) return null;
  const sampleSize = readNumber(raw.sampleSize);
  const rating = readNumber(raw.rating);
  // Guard the floor client-side too: a benchmark is only rendered when it is
  // backed by at least three real listings that actually carry a rating.
  if (sampleSize < 3 || rating <= 0) return null;
  return {
    sampleSize,
    rating,
    reviewCount: readNumber(raw.reviewCount),
    radiusMeters: readNumber(raw.radiusMeters),
  };
}

/** Score a real listing. Only measured inputs are ever passed in. */
function scoreFrom(place: PlaceFacts, signals: ProfileSignals): Score {
  return computePublicScore({
    rating: place.rating,
    reviewCount: place.reviewCount,
    // `undefined` when Google gave us no timestamp — the sub-score renormalises
    // rather than pretending the business has stale reviews.
    daysSinceLastReview: signals.daysSinceLastReview ?? undefined,
    photoCount: signals.photoSampleCount,
    profileCompleteness: signals.profileCompleteness,
    // responseRate is deliberately omitted: not knowable from public data.
  });
}

// ── Honest copy for every unavailable state ────────────────────────────────

function unavailableCopy(reason: Unavailable, typed: string): { title: string; body: string } {
  switch (reason) {
    case "no_key":
      return {
        title: "This scan needs a live Google connection",
        body:
          "The Score is read from Google's public business data, and this site can't reach Google right now. There's nothing to show yet — and we won't estimate a score, because an invented number is worse than no number.",
      };
    case "not_found":
      return {
        title: `We couldn't find “${typed}” on Google`,
        body:
          "Try the exact name shown on your Google listing, and add your city if the name is common. We only score listings we can actually find.",
      };
    case "no_location":
      return {
        title: "Google didn't give us a location for this listing",
        body: "Without real coordinates we can't tell which businesses are nearby, so we're not showing a comparison.",
      };
    case "no_category":
      return {
        title: "We couldn't tell what to compare you against",
        body: "Google didn't return a category for this listing, so there's nothing honest to benchmark against.",
      };
    case "too_few":
      return {
        title: "We couldn't verify enough nearby businesses",
        body:
          "We found fewer than three real listings in your category nearby, which is too thin to call an average. Rather than invent a benchmark, we're leaving it out.",
      };
    default:
      return {
        title: "Google's public data didn't answer",
        body: "The lookup didn't come back this time. Nothing was estimated — try the scan again in a moment.",
      };
  }
}

export function ScoreTool() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0] as string);
  const [err, setErr] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  /** Index of the step currently in flight (equals STEPS.length when finished). */
  const [stepIndex, setStepIndex] = useState(0);
  /** Index of the step where the scan stopped, when it couldn't finish. */
  const [haltedAt, setHaltedAt] = useState<number | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const runRef = useRef(0);

  // ── Compare-a-competitor state ──────────────────────────────
  const [compName, setCompName] = useState("");
  const [compErr, setCompErr] = useState("");
  const [comparing, setComparing] = useState(false);
  const [competitor, setCompetitor] = useState<CompetitorOutcome | null>(null);
  const compRunRef = useRef(0);

  /**
   * The scan. Each `setStepIndex` advances only when the phase it names has
   * genuinely completed, so the progress list reports real work.
   */
  async function runScan(business: string, cat: string, myRun: number) {
    const stale = () => runRef.current !== myRun;
    const halt = (reason: Unavailable, at: number) => {
      setHaltedAt(at);
      setOutcome({ kind: "unavailable", reason, typed: business });
      setPhase("done");
    };

    // 1 — find the listing on Google.
    const matched = await postLookup({ mode: "match", business, category: cat });
    if (stale()) return;
    const matchedPlace = readPlace(matched.place);
    if (matched.status !== "ok" || !matchedPlace) {
      halt(matched.status === "ok" ? "not_found" : matched.status, 0);
      return;
    }
    setStepIndex(1);

    // 2 — read the public profile signals.
    const detailed = await postLookup({ mode: "details", placeId: matchedPlace.placeId });
    if (stale()) return;
    const place = readPlace(detailed.place);
    const signals = readSignals(detailed.signals);
    if (detailed.status !== "ok" || !place || !signals) {
      halt(detailed.status === "ok" ? "error" : detailed.status, 1);
      return;
    }
    setStepIndex(2);

    // 3 — check real nearby businesses. A miss here is NOT fatal: we simply
    //     don't render a benchmark and say why.
    const nearby = await postLookup({
      mode: "benchmark",
      placeId: place.placeId,
      category: cat,
    });
    if (stale()) return;
    const benchmark = nearby.status === "ok" ? readBenchmark(nearby.benchmark) : null;
    const benchmarkReason: Unavailable | null = benchmark
      ? null
      : nearby.status === "ok"
        ? "too_few"
        : nearby.status;
    setStepIndex(3);

    // 4 — score, from measured inputs only.
    setOutcome({
      kind: "scored",
      typed: business,
      category: cat,
      place,
      signals,
      score: scoreFrom(place, signals),
      benchmark,
      benchmarkReason,
    });
    setStepIndex(STEPS.length);
    setPhase("done");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const business = name.trim();
    if (!business) {
      setErr("Enter your business name to run the scan.");
      return;
    }
    setErr("");
    setReduceMotion(
      typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    setOutcome(null);
    setHaltedAt(null);
    setStepIndex(0);
    setPhase("scanning");
    // A fresh primary scan invalidates any prior head-to-head.
    setCompetitor(null);
    setCompErr("");
    setComparing(false);
    compRunRef.current++;
    const myRun = ++runRef.current;
    void runScan(business, category, myRun);
  }

  async function runCompetitorScan(business: string, cat: string, myRun: number) {
    const stale = () => compRunRef.current !== myRun;
    try {
      const matched = await postLookup({ mode: "match", business, category: cat });
      if (stale()) return;
      const matchedPlace = readPlace(matched.place);
      if (matched.status !== "ok" || !matchedPlace) {
        setCompetitor({
          kind: "unavailable",
          reason: matched.status === "ok" ? "not_found" : matched.status,
          typed: business,
        });
        return;
      }
      const detailed = await postLookup({ mode: "details", placeId: matchedPlace.placeId });
      if (stale()) return;
      const place = readPlace(detailed.place);
      const signals = readSignals(detailed.signals);
      if (detailed.status !== "ok" || !place || !signals) {
        setCompetitor({
          kind: "unavailable",
          reason: detailed.status === "ok" ? "error" : detailed.status,
          typed: business,
        });
        return;
      }
      setCompetitor({
        kind: "scored",
        typed: business,
        place,
        score: scoreFrom(place, signals),
      });
    } finally {
      if (!stale()) setComparing(false);
    }
  }

  function handleCompare(e: React.FormEvent) {
    e.preventDefault();
    if (!outcome || outcome.kind !== "scored") return;
    const business = compName.trim();
    if (!business) {
      setCompErr("Enter a business name to compare.");
      return;
    }
    if (business.toLowerCase() === outcome.place.name.toLowerCase()) {
      setCompErr("Enter a different business than your own.");
      return;
    }
    setCompErr("");
    setCompetitor(null);
    setComparing(true);
    const myRun = ++compRunRef.current;
    void runCompetitorScan(business, outcome.category, myRun);
  }

  function handleDownloadCard() {
    if (!outcome || outcome.kind !== "scored") return;
    downloadScoreCard({
      business: outcome.place.name || outcome.typed,
      growth: outcome.score.growth,
      reviews: outcome.score.reviews,
      profile: outcome.score.profile,
      bandLabel: bandLabel(outcome.score.growth),
    });
  }

  const activeStep = STEPS[Math.min(stepIndex, STEPS.length - 1)] ?? "";
  const announcement =
    phase === "scanning"
      ? activeStep
      : phase === "done"
        ? haltedAt === null
          ? "Scan complete"
          : "Scan stopped — nothing to score"
        : "";

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
          <p className="text-[13px] text-faint">
            No signup, no card. Every figure comes from your public Google listing — nothing is estimated.
          </p>
        </form>
      </Card>

      {/* ── Stepped scan (bound to real phases) ────────── */}
      {phase !== "idle" ? (
        <Card>
          <div className="flex items-center justify-between">
            <Kicker>Scanning</Kicker>
            <span aria-live="polite" className="text-[12px] font-medium text-sub">{announcement}</span>
          </div>
          <ul className="mt-4 space-y-2.5">
            {STEPS.map((step, i) => {
              const halted = haltedAt !== null && i === haltedAt;
              const skipped = haltedAt !== null && i > haltedAt;
              const isDone = !halted && !skipped && stepIndex > i;
              const isActive = phase === "scanning" && stepIndex === i;
              return (
                <li key={step} className="flex items-center gap-3">
                  <span
                    className={
                      halted
                        ? "grid size-6 place-items-center rounded-full bg-danger-tint text-danger"
                        : isDone
                          ? "grid size-6 place-items-center rounded-full bg-primary text-white"
                          : isActive
                            ? reduceMotion
                              ? "grid size-6 place-items-center rounded-full border-2 border-primary"
                              : "grid size-6 place-items-center rounded-full border-2 border-primary/30 border-t-primary animate-spin"
                            : "grid size-6 place-items-center rounded-full border border-hairline text-faint"
                    }
                    aria-hidden
                  >
                    {halted ? <Icon name="alert" size={13} /> : isDone ? <Icon name="check" size={14} /> : null}
                  </span>
                  <span
                    className={
                      isDone || isActive
                        ? "text-[14px] font-medium text-ink"
                        : halted
                          ? "text-[14px] font-medium text-danger"
                          : "text-[14px] text-faint"
                    }
                  >
                    {step}
                    {skipped ? <span className="ml-2 text-[12px] text-faint">not run</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {/* ── Reveal ─────────────────────────────────────── */}
      {phase === "done" && outcome ? (
        <div className={reduceMotion ? "space-y-5" : "space-y-5 animate-fade-in"}>
          {outcome.kind === "unavailable" ? (
            <UnavailableCard reason={outcome.reason} typed={outcome.typed} />
          ) : (
            <>
              {/* Score hero */}
              <div className="on-hero rounded-card bg-hero p-6 text-white shadow-lg">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="kicker text-gold">Local Growth Score</div>
                    <div className="mt-0.5 text-[15px] font-semibold">{outcome.place.name || outcome.typed}</div>
                    {outcome.place.address ? (
                      <div className="mt-0.5 text-[12px] text-white/70">{outcome.place.address}</div>
                    ) : null}
                  </div>
                  <Badge tone="gold" icon="sparkles">{bandLabel(outcome.score.growth)}</Badge>
                </div>
                <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
                  <ScoreDial value={outcome.score.growth} size={184} label="" onHero />
                  <div className="flex items-center gap-8">
                    <SubDial value={outcome.score.reviews} label="Reviews" onHero />
                    <SubDial value={outcome.score.profile} label="Profile" onHero />
                  </div>
                </div>
                <p className="mt-4 text-center text-[12px] leading-relaxed text-white/70 sm:text-right">
                  Computed from your public Google listing only. Owner reply rate isn&apos;t public,
                  so it isn&apos;t part of this score.
                </p>
                <div className="mt-4 flex justify-center sm:justify-end">
                  <Button type="button" onClick={handleDownloadCard} variant="gold" size="sm" icon="download">
                    Download score card
                  </Button>
                </div>
              </div>

              {/* What we actually verified */}
              <VerifiedCard place={outcome.place} signals={outcome.signals} />

              {/* Nearby benchmark — real listings, or an honest absence */}
              {outcome.benchmark ? (
                <Card>
                  <div className="mb-4">
                    <Kicker>You vs the block</Kicker>
                    <h3 className="mt-1 text-[17px] font-bold text-ink">Real businesses near you</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-sub">
                      Aggregated from{" "}
                      <span className="data-chip text-ink">{outcome.benchmark.sampleSize}</span>{" "}
                      real Google listings in the same category within{" "}
                      <span className="data-chip text-ink">
                        {Math.round(outcome.benchmark.radiusMeters / 1000)} km
                      </span>
                      . Your own listing is excluded.
                    </p>
                  </div>
                  <div className="space-y-5">
                    <BenchmarkBar
                      label="Star rating"
                      you={outcome.place.rating}
                      others={[{ name: "Nearby average", value: outcome.benchmark.rating }]}
                    />
                    <BenchmarkBar
                      label="Total reviews"
                      you={outcome.place.reviewCount}
                      others={[{ name: "Nearby median", value: outcome.benchmark.reviewCount }]}
                    />
                  </div>
                  <p className="mt-4 text-[12px] leading-relaxed text-faint">
                    Star rating is the mean across those listings; review count is the median, so one
                    outsized competitor can&apos;t skew it. Review recency and reply rates aren&apos;t
                    public for other businesses, so they aren&apos;t compared.
                  </p>
                </Card>
              ) : (
                <NoBenchmarkCard reason={outcome.benchmarkReason ?? "error"} />
              )}

              {/* Compare a competitor */}
              <Card>
                <div className="mb-4">
                  <Kicker>Compare another business</Kicker>
                  <h3 className="mt-1 text-[17px] font-bold text-ink">See how you stack up</h3>
                  <p className="mt-1 text-[13px] text-sub">
                    Enter any nearby {outcome.category.toLowerCase()} to run the same real-data Score on them.
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
                  <div className={reduceMotion ? "mt-6 border-t border-hairline pt-6" : "mt-6 border-t border-hairline pt-6 animate-fade-in"}>
                    {competitor.kind === "scored" ? (
                      <>
                        <div className="flex items-center justify-center gap-6 sm:gap-10">
                          <ScoreDial value={outcome.score.growth} size={128} label={outcome.place.name || outcome.typed} />
                          <span className="kicker text-faint">vs</span>
                          <ScoreDial value={competitor.score.growth} size={128} label={competitor.place.name || competitor.typed} />
                        </div>
                        <div className="mt-6 space-y-5">
                          <BenchmarkBar
                            label="Star rating"
                            you={outcome.place.rating}
                            others={[{ name: competitor.place.name || competitor.typed, value: competitor.place.rating }]}
                          />
                          <BenchmarkBar
                            label="Total reviews"
                            you={outcome.place.reviewCount}
                            others={[{ name: competitor.place.name || competitor.typed, value: competitor.place.reviewCount }]}
                          />
                        </div>
                        <p className="mt-4 text-[12px] text-faint">
                          Both sides read from public Google listings — same method, same limits.
                        </p>
                      </>
                    ) : (
                      <div className="flex items-start gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-btn bg-danger-tint text-danger">
                          <Icon name="alert" size={16} />
                        </span>
                        <div>
                          <div className="text-[14px] font-semibold text-ink">
                            {unavailableCopy(competitor.reason, competitor.typed).title}
                          </div>
                          <p className="mt-1 text-[13px] leading-relaxed text-sub">
                            {unavailableCopy(competitor.reason, competitor.typed).body}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </Card>
            </>
          )}

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

          {/* CTA — the page stays useful even when there's no score */}
          <div className="on-hero rounded-card bg-hero px-6 py-8 text-center text-white shadow-lg">
            <h3 className="text-[22px] font-extrabold tracking-tight sm:text-[26px]">
              Build a trustworthy review habit
            </h3>
            <p className="mx-auto mt-2 max-w-md text-[14px] text-white/75">
              Start free and Foundly handles consent-aware requests, reminders, review monitoring,
              and owner-reply suggestions. No card for 14 days.
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

// ── Sub-views ───────────────────────────────────────────────────────────────

function UnavailableCard({ reason, typed }: { reason: Unavailable; typed: string }) {
  const copy = unavailableCopy(reason, typed);
  return (
    <Card raised>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
          <Icon name="search" size={20} />
        </span>
        <div>
          <Kicker>No score to show</Kicker>
          <h3 className="mt-1 text-[17px] font-bold text-ink">{copy.title}</h3>
          <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-sub">{copy.body}</p>
          <p className="mt-3 text-[12px] leading-relaxed text-faint">
            Foundly never shows a number it can&apos;t source. {MICROCOPY.actionsNotCustomers}
          </p>
        </div>
      </div>
    </Card>
  );
}

function NoBenchmarkCard({ reason }: { reason: Unavailable }) {
  const copy = unavailableCopy(reason, "");
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
          <Icon name="map-pin" size={16} />
        </span>
        <div>
          <Kicker>You vs the block</Kicker>
          <h3 className="mt-1 text-[15px] font-bold text-ink">{copy.title}</h3>
          <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-sub">{copy.body}</p>
        </div>
      </div>
    </Card>
  );
}

function VerifiedCard({ place, signals }: { place: PlaceFacts; signals: ProfileSignals }) {
  const checks: { label: string; present: boolean }[] = [
    { label: "Opening hours", present: signals.present.hours },
    { label: "Phone number", present: signals.present.phone },
    { label: "Website", present: signals.present.website },
    { label: "Business description", present: signals.present.description },
  ];

  const recency =
    place.reviewCount === 0
      ? "No reviews yet"
      : signals.daysSinceLastReview === null
        ? "Not published by Google"
        : `${signals.daysSinceLastReview} days ago`;

  return (
    <Card>
      <div className="mb-4">
        <Kicker>What we verified</Kicker>
        <h3 className="mt-1 text-[17px] font-bold text-ink">Straight from your Google listing</h3>
        <p className="mt-1 text-[13px] text-sub">
          Each figure below is what Google publishes today — with its limits stated.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Fact
          icon="star"
          label="Star rating"
          value={place.rating > 0 ? place.rating.toFixed(1) : "—"}
          note="Google's aggregate across every review."
        />
        <Fact
          icon="chat"
          label="Total reviews"
          value={String(place.reviewCount)}
          note="The complete count Google reports."
        />
        <Fact
          icon="clock"
          label="Newest review we can see"
          value={recency}
          note="From the public review sample — Google shows at most 5, so a newer one may exist."
        />
        <Fact
          icon="camera"
          label="Photos"
          value={signals.photoSampleCount > 0 ? `At least ${signals.photoSampleCount}` : "None returned"}
          note="Google caps the photos it returns publicly; your listing may have more."
        />
      </div>

      <div className="mt-4 rounded-card border border-hairline bg-paper p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-ink">Profile completeness</span>
          <span className="data-chip text-primary-dark">{signals.profileCompleteness} / 100</span>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-[13px]">
              <Icon
                name={c.present ? "check-circle" : "x"}
                size={15}
                className={c.present ? "shrink-0 text-primary" : "shrink-0 text-faint"}
              />
              <span className={c.present ? "text-ink" : "text-faint"}>{c.label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] leading-relaxed text-faint">
          Scored purely on which of these four fields your public listing exposes — hours 30, phone 25,
          website 25, description 20. Posts, Q&amp;A, and owner replies aren&apos;t public, so they
          aren&apos;t counted here.
        </p>
      </div>
    </Card>
  );
}

function Fact({
  icon, label, value, note,
}: {
  icon: "star" | "chat" | "clock" | "camera"; label: string; value: string; note: string;
}) {
  return (
    <div className="rounded-card border border-hairline bg-paper p-4">
      <div className="flex items-center gap-2">
        <Icon name={icon} size={15} className="shrink-0 text-primary" />
        <span className="text-[12px] font-semibold text-sub">{label}</span>
      </div>
      <div className="mt-1.5 text-[20px] font-extrabold tabular-nums text-ink">{value}</div>
      <p className="mt-1 text-[12px] leading-relaxed text-faint">{note}</p>
    </div>
  );
}

function bandLabel(score: number): string {
  const band = scoreBand(score);
  return band === "high" ? "Strong" : band === "mid" ? "Room to grow" : "Needs attention";
}
