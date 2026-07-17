import type { Metadata } from "next";
import type { IconName } from "@/components/icons";
import { Icon } from "@/components/icons";
import { LinkButton } from "@/components/ds/Button";
import { Band, Container, Eyebrow, SectionHead, CtaBand, heroSecondaryBtn } from "../../_components/primitives";

interface VerticalContent {
  label: string;
  eyebrow: string;
  headline: string;
  subhead: string;
  proof: { stat: string; label: string }[];
  moments: { icon: IconName; title: string; body: string }[];
  quote: { text: string; name: string; role: string };
}

const KNOWN = ["physiotherapy", "chiropractic", "dental", "hvac", "renovation"] as const;

const CONTENT: Record<string, VerticalContent> = {
  physiotherapy: {
    label: "Physiotherapy",
    eyebrow: "For physio & rehab clinics",
    headline: "Turn great recoveries into a full appointment book",
    subhead:
      "Your patients love the results — Foundly captures that goodwill the moment a session ends, so the reviews that win new referrals actually get posted.",
    proof: [
      { stat: "3.1×", label: "more reviews vs. asking manually" },
      { stat: "4.8★", label: "typical rating clinics hold" },
      { stat: "72%", label: "of new patients read reviews first" },
    ],
    moments: [
      { icon: "send", title: "Ask at discharge", body: "A therapist taps once after a milestone session — the request goes out while the win is fresh." },
      { icon: "star", title: "Recovery stories that convert", body: "AI drafts a warm, specific review the patient can personalize in seconds — never generic." },
      { icon: "trend", title: "Own the map pack", body: "Steady, durable reviews plus an optimized profile push you above the clinic down the road." },
    ],
    quote: {
      text: "Patients always said they'd leave a review and never did. Now it's automatic and our new-patient calls have never been steadier.",
      name: "Maya Rodriguez",
      role: "Owner · Riverside Physiotherapy",
    },
  },
  chiropractic: {
    label: "Chiropractic",
    eyebrow: "For chiropractic offices",
    headline: "Adjustments that feel great, reviews that follow",
    subhead:
      "Regular patients are your best marketers. Foundly asks them at the right visit and keeps your Google profile working between appointments.",
    proof: [
      { stat: "2.8×", label: "more reviews per month" },
      { stat: "4.9★", label: "ratings top offices sustain" },
      { stat: "68%", label: "choose the higher-rated office nearby" },
    ],
    moments: [
      { icon: "send", title: "Ask on the right visit", body: "Front desk sends a request after a standout adjustment — consent captured in person." },
      { icon: "star", title: "Specific, believable reviews", body: "Drafts mention the relief and the care, not empty five-star fluff." },
      { icon: "compass", title: "Named in AI search", body: "When someone asks an AI for a chiropractor nearby, we track whether it's you — and fix it if not." },
    ],
    quote: {
      text: "We went from a trickle of reviews to a steady stream, and new patients tell us they found us at the top of the map.",
      name: "Dr. Sam Whitfield",
      role: "Chiropractor · Align Family Care",
    },
  },
  dental: {
    label: "Dental",
    eyebrow: "For dental practices",
    headline: "A brighter profile brings brighter smiles in the door",
    subhead:
      "New patients vet dentists carefully. Foundly builds the steady, recent review flow and polished profile that earns their first call.",
    proof: [
      { stat: "3.4×", label: "review velocity vs. before" },
      { stat: "4.8★", label: "rating practices maintain" },
      { stat: "77%", label: "read reviews before booking a dentist" },
    ],
    moments: [
      { icon: "send", title: "Ask after the cleaning", body: "A hygienist sends the request as the patient checks out, happy and pain-free." },
      { icon: "star", title: "Reviews that mention the care", body: "AI drafts reference the gentle visit and friendly team — edited into the patient's own words." },
      { icon: "shield", title: "Reviews that stay up", body: "The durability watchdog flags any review Google filters, so your rating reflects reality." },
    ],
    quote: {
      text: "Our recency was killing us — lots of old reviews, nothing recent. Foundly fixed that in a month.",
      name: "Dr. Priya Nair",
      role: "Owner · Bright Smile Dental",
    },
  },
  hvac: {
    label: "HVAC",
    eyebrow: "For HVAC & home-service pros",
    headline: "Every finished job becomes proof for the next one",
    subhead:
      "When the AC is fixed and the customer is relieved, that's the moment. Foundly asks from the truck, so your best jobs become the reviews that book the next.",
    proof: [
      { stat: "3.6×", label: "more reviews per tech" },
      { stat: "4.9★", label: "rating top crews hold" },
      { stat: "81%", label: "pick the higher-rated contractor" },
    ],
    moments: [
      { icon: "qr", title: "Ask from the job site", body: "The tech shows a QR or sends a text before leaving — while the customer is thrilled it's fixed." },
      { icon: "star", title: "Reviews that name the tech", body: "Drafts credit the technician and the fix, building trust and a per-tech leaderboard." },
      { icon: "trend", title: "Rank across the service area", body: "The local rank grid shows exactly which neighborhoods you win — and where to push." },
    ],
    quote: {
      text: "My techs actually use it because it's one tap. We doubled our monthly reviews without nagging anyone.",
      name: "Carlos Mendez",
      role: "Owner · Peak Comfort Heating & Air",
    },
  },
  renovation: {
    label: "Renovation",
    eyebrow: "For renovation & contractors",
    headline: "Big projects, bigger proof",
    subhead:
      "A renovation is a leap of faith — homeowners lean hard on reviews. Foundly turns every finished project into durable, detailed proof that wins the next bid.",
    proof: [
      { stat: "2.9×", label: "more reviews per project" },
      { stat: "4.8★", label: "rating trusted builders hold" },
      { stat: "84%", label: "research reviews before a quote" },
    ],
    moments: [
      { icon: "send", title: "Ask at final walkthrough", body: "Request the review at handover, when the transformation is right in front of them." },
      { icon: "camera", title: "Reviews with the story", body: "AI drafts capture the scope and the finish — detailed reviews that reassure the next homeowner." },
      { icon: "compass", title: "Be the named recommendation", body: "We track whether AI search and the map pack recommend you for local renovation queries." },
    ],
    quote: {
      text: "Homeowners want to see recent, detailed reviews before they trust you with their house. Now we have them.",
      name: "Dana Brooks",
      role: "Owner · Northside Renovations",
    },
  },
};

const FALLBACK: VerticalContent = {
  label: "Local business",
  eyebrow: "For local businesses",
  headline: "Get found and get chosen in your neighborhood",
  subhead:
    "Whatever you do locally, the playbook is the same: ask happy customers at the right moment, keep your profile sharp, and let honest proof do the selling.",
  proof: [
    { stat: "3×", label: "typical lift in review velocity" },
    { stat: "4.8★", label: "rating strong locals hold" },
    { stat: "76%", label: "read reviews before choosing" },
  ],
  moments: [
    { icon: "send", title: "Ask at the peak moment", body: "A staff tap or QR sends the request when goodwill is highest — with consent captured." },
    { icon: "star", title: "Reviews in your voice", body: "AI drafts a specific first version your customer edits into their own words." },
    { icon: "trend", title: "Climb the local pack", body: "Durable reviews and a live profile lift you above the businesses next door." },
  ],
  quote: {
    text: "It's the first review tool my whole team actually uses — because it takes one tap.",
    name: "Jordan Lee",
    role: "Owner · a growing local business",
  },
};

export function generateStaticParams() {
  return KNOWN.map((vertical) => ({ vertical }));
}

export async function generateMetadata({ params }: { params: Promise<{ vertical: string }> }): Promise<Metadata> {
  const { vertical } = await params;
  const content = CONTENT[vertical] ?? FALLBACK;
  return {
    title: `Foundly for ${content.label}`,
    description: content.subhead,
  };
}

export default async function VerticalPage({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = await params;
  const content = CONTENT[vertical] ?? FALLBACK;

  return (
    <div>
      {/* ── Hero — paper ─────────────────────────────────── */}
      <Band tone="paper">
        <Container size="md" className="text-center">
          <Eyebrow className="justify-center">{content.eyebrow}</Eyebrow>
          <h1 className="mx-auto mt-4 max-w-3xl text-[34px] font-extrabold leading-[1.08] tracking-tight text-ink sm:text-[48px]">
            {content.headline}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-sub sm:text-[18px]">
            {content.subhead}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <LinkButton href="/score" size="lg" icon="sparkles">Get my free Growth Score</LinkButton>
            <LinkButton href="/sign-up" size="lg" variant="secondary" iconRight="chevron-right">Start free trial</LinkButton>
          </div>
        </Container>
      </Band>

      {/* ── Proof stats — white spec cells ───────────────── */}
      <Band tone="white" className="py-12 sm:py-16">
        <Container size="md">
          <div className="grid grid-cols-1 divide-y divide-hairline rounded-card border border-hairline bg-paper sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {content.proof.map((p) => (
              <div key={p.label} className="px-4 py-6 text-center">
                <div className="text-[34px] font-extrabold tabular-nums tracking-tight text-primary-dark">{p.stat}</div>
                <div className="mt-1 text-[13px] text-sub">{p.label}</div>
              </div>
            ))}
          </div>
        </Container>
      </Band>

      {/* ── Moments — paper ──────────────────────────────── */}
      <Band tone="paper">
        <Container>
          <SectionHead
            eyebrow={`How it works for ${content.label.toLowerCase()}`}
            title="Built around your real moments"
            align="center"
          />
          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {content.moments.map((m) => (
              <div key={m.title} className="flex flex-col rounded-card border border-hairline bg-card p-6">
                <div className="grid size-12 place-items-center rounded-btn bg-primary-tint text-primary-dark">
                  <Icon name={m.icon} size={24} />
                </div>
                <h3 className="mt-4 text-[17px] font-bold text-ink">{m.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-sub">{m.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Band>

      {/* ── Quote — white ────────────────────────────────── */}
      <Band tone="white">
        <Container size="sm">
          <figure className="rounded-card border border-hairline bg-paper p-8">
            <div className="flex gap-1 text-star" aria-label="Five stars">
              {Array.from({ length: 5 }).map((_, i) => (
                <Icon key={i} name="star-fill" size={18} />
              ))}
            </div>
            <blockquote className="mt-4 text-[19px] font-semibold leading-snug tracking-tight text-ink sm:text-[22px]">
              &ldquo;{content.quote.text}&rdquo;
            </blockquote>
            <figcaption className="mt-4 text-[13px] text-sub">
              <span className="font-bold text-ink">{content.quote.name}</span> · {content.quote.role}
            </figcaption>
          </figure>
        </Container>
      </Band>

      {/* ── Close — deep-green ───────────────────────────── */}
      <CtaBand
        eyebrow="No card required"
        title="Ready to be the obvious choice?"
        lede="Run your free Growth Score, or start a 14-day Growth trial — no card required."
        actions={
          <>
            <LinkButton href="/score" size="lg" icon="sparkles">Get my free Growth Score</LinkButton>
            <LinkButton href="/sign-up" size="lg" variant="secondary" className={heroSecondaryBtn}>
              Start free trial
            </LinkButton>
          </>
        }
      />
    </div>
  );
}
