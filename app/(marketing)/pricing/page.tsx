import type { Metadata } from "next";
import { LinkButton } from "@/components/ds/Button";
import { Band, Container, Eyebrow, SectionHead, CtaBand, heroSecondaryBtn } from "../_components/primitives";
import { PricingBoard } from "./PricingBoard";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, honest pricing. Start with 14 days of Growth free — no credit card — then keep a free plan forever. Plans for single locations, teams, and white-label agencies.",
};

const FAQ = [
  {
    q: "What happens when the trial ends?",
    a: "Nothing auto-charges. You drop to the free plan and keep your reviews, score, and QR kit. Upgrade whenever it makes sense.",
  },
  {
    q: "Do I need a credit card to start?",
    a: "No. The 14-day Growth trial needs no card. We only ask for payment if you choose to stay on a paid plan.",
  },
  {
    q: "Can I switch plans or regions later?",
    a: "Anytime. Move up or down, switch monthly to annual, or change currency — changes prorate automatically.",
  },
  {
    q: "Are reviews ever incentivized?",
    a: "Never. Foundly only helps you ask real customers at the right moment. Rewarding reviews violates Google policy and we won't do it.",
  },
];

export default function PricingPage() {
  return (
    <div>
      {/* ── Hero + board — paper ─────────────────────────── */}
      <Band tone="paper">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow className="justify-center">Pricing</Eyebrow>
            <h1 className="mt-3 text-[32px] font-extrabold leading-tight tracking-tight text-ink sm:text-[44px]">
              Pricing that grows with you
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-[16px] leading-relaxed text-sub">
              Start free, prove it works, then scale. Every paid plan begins with 14 days of Growth —
              no credit card, no fake countdowns.
            </p>
          </div>

          <div className="mt-12">
            <PricingBoard />
          </div>
        </Container>
      </Band>

      {/* ── FAQ — white ──────────────────────────────────── */}
      <Band tone="white">
        <Container size="sm">
          <SectionHead eyebrow="FAQ" title="Questions, answered plainly" align="center" />
          <dl className="mt-8 divide-y divide-hairline rounded-card border border-hairline bg-paper">
            {FAQ.map((item) => (
              <div key={item.q} className="p-5 sm:p-6">
                <dt className="text-[15px] font-bold text-ink">{item.q}</dt>
                <dd className="mt-1.5 text-[14px] leading-relaxed text-sub">{item.a}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </Band>

      {/* ── Close — deep-green ───────────────────────────── */}
      <CtaBand
        eyebrow="No card to start"
        title="Try the full Growth plan free"
        lede="Run the whole loop for 14 days, then keep a free plan forever. Nothing auto-charges."
        actions={
          <>
            <LinkButton href="/sign-up" size="lg" icon="sparkles">Start 14-day trial</LinkButton>
            <LinkButton href="/score" size="lg" variant="secondary" className={heroSecondaryBtn}>
              Get my free Score
            </LinkButton>
          </>
        }
      />
    </div>
  );
}
