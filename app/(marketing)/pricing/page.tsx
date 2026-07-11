import type { Metadata } from "next";
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
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-[32px] font-extrabold leading-tight tracking-tight text-ink sm:text-[44px]">
          Pricing that grows with you
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-[16px] leading-relaxed text-sub">
          Start free, prove it works, then scale. Every paid plan begins with 14 days of Growth — no
          credit card, no fake countdowns.
        </p>
      </div>

      <div className="mt-12">
        <PricingBoard />
      </div>

      {/* FAQ */}
      <div className="mx-auto mt-20 max-w-3xl">
        <h2 className="text-center text-[24px] font-extrabold tracking-tight text-ink sm:text-[30px]">
          Questions, answered plainly
        </h2>
        <dl className="mt-8 divide-y divide-hairline rounded-card border border-hairline bg-card">
          {FAQ.map((item) => (
            <div key={item.q} className="p-5 sm:p-6">
              <dt className="text-[15px] font-bold text-ink">{item.q}</dt>
              <dd className="mt-1.5 text-[14px] leading-relaxed text-sub">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
