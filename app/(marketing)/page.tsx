import type { IconName } from "@/components/icons";
import { Icon } from "@/components/icons";
import { LinkButton } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { ScoreDial } from "@/components/charts/ScoreDial";
import { SubDial } from "@/components/charts/SubDial";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { Band, Container, Eyebrow, SectionHead, TrustRow, CtaBand, heroSecondaryBtn } from "./_components/primitives";

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
      {/* ── Hero — paper ─────────────────────────────────── */}
      <Band tone="paper">
        <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-14">
          <div>
            <Eyebrow>Local growth, on autopilot</Eyebrow>
            <h1 className="mt-5 text-[40px] font-extrabold leading-[1.03] tracking-tight text-ink sm:text-[54px]">
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
              30 days of every tool free · no credit card · keep a free plan forever.
            </p>
          </div>

          {/* Product preview — real chart components, labeled Sample data */}
          <div className="lg:pl-6">
            <div className="relative mx-auto max-w-md rounded-card border border-hairline bg-card p-5 shadow-lg sm:p-6">
              <div className="flex items-center justify-between">
                <Eyebrow>Local Growth Score</Eyebrow>
                <Badge tone="neutral" icon="eye">Sample data</Badge>
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
              <p className="mt-3 text-center text-[12px] text-faint">{MICROCOPY.detectedMatch}</p>
            </div>
          </div>
        </Container>
      </Band>

      {/* ── Trust row — white ────────────────────────────── */}
      <Band tone="white" className="py-12 sm:py-16">
        <Container>
          <TrustRow />
        </Container>
      </Band>

      {/* ── The loop — paper ─────────────────────────────── */}
      <Band tone="paper">
        <Container>
          <SectionHead
            eyebrow="The growth loop"
            title="One motion that compounds"
            lede="Every review makes you easier to find, and every new customer becomes the next review. Foundly runs the whole loop so it keeps spinning without you chasing it."
          />
          <ol className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LOOP.map((step, i) => (
              <li
                key={step.label}
                className="group relative flex flex-col rounded-card border border-hairline bg-card p-5 transition-colors hover:border-primary/40"
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
        </Container>
      </Band>

      {/* ── The moat — white ─────────────────────────────── */}
      <Band tone="white">
        <Container>
          <SectionHead
            eyebrow="Why it lasts"
            title="The moat under the reviews"
            lede="Anyone can text a review link. Three things make Foundly hard to leave — and hard to copy."
          />
          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {MOAT.map((m) => (
              <div key={m.title} className="flex flex-col rounded-card border border-hairline bg-paper p-6">
                <div className="grid size-12 place-items-center rounded-btn bg-hero text-white">
                  <Icon name={m.icon} size={24} />
                </div>
                <div className="kicker mt-4 text-primary-dark">{m.kicker}</div>
                <h3 className="mt-1 text-[18px] font-bold text-ink">{m.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-sub">{m.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Band>

      {/* ── Honesty stance — paper ───────────────────────── */}
      <Band tone="paper">
        <Container size="md" className="flex flex-col items-center text-center">
          <div className="grid size-12 place-items-center rounded-btn bg-primary text-white">
            <Icon name="shield" size={24} />
          </div>
          <p className="mt-5 max-w-2xl text-[24px] font-bold leading-snug tracking-tight text-ink sm:text-[30px]">
            {MICROCOPY.actionsNotCustomers}
          </p>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-sub">
            We report people who found you, contacted you, and left reviews — never invented revenue
            or fake customer counts. {MICROCOPY.noIncentive}
          </p>
        </Container>
      </Band>

      {/* ── Testimonial — white ──────────────────────────── */}
      <Band tone="white">
        <Container size="md">
          <figure className="rounded-card border border-hairline bg-paper p-8 sm:p-12">
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
        </Container>
      </Band>

      {/* ── Final CTA — deep-green close ──────────────────── */}
      <CtaBand
        eyebrow="Free · 30 seconds"
        title="See your Growth Score in 30 seconds"
        lede="No signup, no card. Enter your business and watch Foundly read your public Google profile, count your reviews, and compare you to nearby businesses on the spot."
        actions={
          <>
            <LinkButton href="/score" size="lg" icon="sparkles">Get my free Growth Score</LinkButton>
            <LinkButton href="/sign-up" size="lg" variant="secondary" className={heroSecondaryBtn}>
              Start 30-day trial
            </LinkButton>
          </>
        }
        footnote="Trusted by local clinics, trades, and studios across the US & Canada."
      />
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
