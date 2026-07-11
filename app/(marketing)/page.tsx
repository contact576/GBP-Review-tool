import Link from "next/link";
import type { IconName } from "@/components/icons";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Badge, Kicker } from "@/components/ds/misc";
import { ScoreDial } from "@/components/charts/ScoreDial";
import { SubDial } from "@/components/charts/SubDial";
import { MICROCOPY } from "@/lib/compliance/microcopy";

const LOOP: { icon: IconName; label: string; caption: string }[] = [
  { icon: "send", label: "Ask", caption: "A staff tap or QR sends a request the moment goodwill is highest." },
  { icon: "star", label: "Reviews", caption: "Happy customers post real, durable Google reviews — never incentivized." },
  { icon: "sparkles", label: "Optimized profile", caption: "The Co-Pilot keeps your Google profile fresh with weekly tasks." },
  { icon: "trend", label: "Rank", caption: "More reviews plus a live profile lift you in the local map pack." },
  { icon: "users", label: "They choose you", caption: "People find you, read the proof, and choose you over the block." },
  { icon: "refresh", label: "Come back", caption: "Consent-based winbacks bring them in again — and the loop spins." },
];

const MOAT: { icon: IconName; kicker: string; title: string; body: string }[] = [
  {
    icon: "shield",
    kicker: "Durability watchdog",
    title: "Reviews that actually stay up",
    body:
      "Most tools count reviews the day they post. We watch them for 30 and 60 days and flag the ones Google filters — so your score reflects reviews that survive.",
  },
  {
    icon: "compass",
    kicker: "AI visibility · AEO",
    title: "Named in the AI answer",
    body:
      "Search is moving to answers. We track whether ChatGPT and Google's AI name your business for the queries that matter — and close the gap when they don't.",
  },
  {
    icon: "building",
    kicker: "Agency channel",
    title: "Built to be resold",
    body:
      "A white-label ladder and wholesale economics let agencies run Foundly for dozens of local clients under their own brand — a channel competitors can't copy overnight.",
  },
];

export default function HomePage() {
  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:pb-24 lg:pt-20">
          <div>
            <Badge tone="gold" icon="sparkles">Local growth, on autopilot</Badge>
            <h1 className="mt-5 text-[38px] font-extrabold leading-[1.05] tracking-tight text-ink sm:text-[52px]">
              Get found and
              <br className="hidden sm:block" /> get chosen
            </h1>
            <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-sub sm:text-[18px]">
              Foundly builds you a steady, durable stream of Google reviews, keeps your Business
              Profile optimized, and shows honest proof it&apos;s working — one score, three numbers,
              three tasks a week.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <LinkButton href="/score" size="lg" icon="sparkles">Get my free Growth Score</LinkButton>
              <LinkButton href="/pricing" size="lg" variant="secondary" iconRight="chevron-right">
                See pricing
              </LinkButton>
            </div>
            <p className="mt-4 text-[13px] text-faint">
              14 days of Growth free · no credit card · keep a free plan forever.
            </p>
          </div>

          {/* Product preview — the live demo */}
          <div className="lg:pl-6">
            <Card raised className="relative mx-auto max-w-md">
              <div className="flex items-center justify-between">
                <Kicker>Local Growth Score</Kicker>
                <Badge tone="primary" icon="trend">Live demo</Badge>
              </div>
              <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:justify-between">
                <ScoreDial value={78} size={168} label="" sublabel="Bright Smile Dental" delta={6} />
                <div className="flex items-center gap-6">
                  <SubDial value={76} label="Reviews" />
                  <SubDial value={82} label="Profile" />
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-hairline pt-4 text-center">
                <Stat n="+18" label="Found you" />
                <Stat n="+11" label="Contacted" />
                <Stat n="+9" label="New reviews" />
              </div>
              <p className="mt-3 text-center text-[12px] text-faint">
                {MICROCOPY.detectedMatch}
              </p>
            </Card>
          </div>
        </div>
        <div aria-hidden className="pointer-events-none absolute -right-24 top-10 -z-10 size-72 rounded-full bg-primary-wash blur-3xl" />
      </section>

      {/* ── The loop ─────────────────────────────────────── */}
      <section className="border-y border-hairline bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="max-w-2xl">
            <Kicker>The growth loop</Kicker>
            <h2 className="mt-2 text-[28px] font-extrabold tracking-tight text-ink sm:text-[34px]">
              One motion that compounds
            </h2>
            <p className="mt-3 text-[15px] text-sub sm:text-[16px]">
              Every review makes you easier to find, every new customer becomes the next review.
              Foundly runs the whole loop so it keeps spinning without you chasing it.
            </p>
          </div>

          <ol className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LOOP.map((step, i) => (
              <li
                key={step.label}
                className="group relative flex flex-col rounded-card border border-hairline bg-paper p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-btn bg-primary-tint text-primary-dark">
                    <Icon name={step.icon} size={22} />
                  </div>
                  <div className="data-chip text-faint">{String(i + 1).padStart(2, "0")}</div>
                  <span className="ml-auto text-[15px] font-bold text-ink">{step.label}</span>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-sub">{step.caption}</p>
                {i < LOOP.length - 1 ? (
                  <Icon
                    name="arrow-right"
                    size={18}
                    className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-hairline lg:block"
                  />
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── The moat ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="max-w-2xl">
          <Kicker>Why it lasts</Kicker>
          <h2 className="mt-2 text-[28px] font-extrabold tracking-tight text-ink sm:text-[34px]">
            The moat under the reviews
          </h2>
          <p className="mt-3 text-[15px] text-sub sm:text-[16px]">
            Anyone can text a review link. Three things make Foundly hard to leave — and hard to copy.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {MOAT.map((m) => (
            <Card key={m.title} className="flex flex-col">
              <div className="grid size-12 place-items-center rounded-btn bg-hero text-white">
                <Icon name={m.icon} size={24} />
              </div>
              <div className="kicker mt-4 text-gold-deep">{m.kicker}</div>
              <h3 className="mt-1 text-[18px] font-bold text-ink">{m.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-sub">{m.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Honesty stance strip ─────────────────────────── */}
      <section className="border-y border-hairline bg-primary-wash">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-14 text-center sm:px-6">
          <div className="grid size-12 place-items-center rounded-btn bg-primary text-white">
            <Icon name="shield" size={24} />
          </div>
          <p className="text-[22px] font-extrabold leading-snug tracking-tight text-ink sm:text-[28px]">
            {MICROCOPY.actionsNotCustomers}
          </p>
          <p className="max-w-xl text-[15px] text-sub">
            We report people who found you, contacted you, and left reviews — never invented revenue
            or fake customer counts. {MICROCOPY.noIncentive}
          </p>
        </div>
      </section>

      {/* ── Testimonial ──────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:py-24">
        <figure className="rounded-card border border-hairline bg-card p-8 shadow-lg sm:p-12">
          <div className="flex gap-1 text-star" aria-label="Five stars">
            {Array.from({ length: 5 }).map((_, i) => (
              <Icon key={i} name="star-fill" size={20} />
            ))}
          </div>
          <blockquote className="mt-5 text-[22px] font-semibold leading-snug tracking-tight text-ink sm:text-[26px]">
            &ldquo;We went from asking for reviews and forgetting, to a steady stream every week
            without thinking about it. The map pack finally has us at the top of the block.&rdquo;
          </blockquote>
          <figcaption className="mt-6 flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-chip bg-hero text-[14px] font-bold text-white">
              MR
            </div>
            <div>
              <div className="text-[14px] font-bold text-ink">Maya Rodriguez</div>
              <div className="text-[13px] text-sub">Owner · Riverside Physiotherapy</div>
            </div>
          </figcaption>
        </figure>
      </section>

      {/* ── Final CTA band ───────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="on-hero overflow-hidden rounded-card bg-hero px-6 py-14 text-center text-white shadow-lg sm:px-12 sm:py-16">
          <h2 className="mx-auto max-w-2xl text-[30px] font-extrabold leading-tight tracking-tight sm:text-[40px]">
            See your Growth Score in 30 seconds
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] text-white/75 sm:text-[17px]">
            No signup, no card. Enter your business and watch Foundly scan your profile, count your
            reviews, and draft a real sample review on the spot.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <LinkButton href="/score" size="lg" variant="gold" icon="sparkles">
              Get my free Growth Score
            </LinkButton>
            <LinkButton href="/sign-up" size="lg" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/20">
              Start 14-day trial
            </LinkButton>
          </div>
          <p className="mt-5 text-[13px] text-white/60">Trusted by local clinics, trades, and studios across the US &amp; Canada.</p>
        </div>
      </section>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <div className="text-[18px] font-extrabold tabular-nums text-primary-dark">{n}</div>
      <div className="mt-0.5 text-[11px] text-faint">{label}</div>
    </div>
  );
}
