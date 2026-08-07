import type { Metadata } from "next";
import { LinkButton } from "@/components/ds/Button";
import { Band, Container, Eyebrow, SectionHead, TrustRow, CtaBand, heroSecondaryBtn } from "../_components/primitives";
import { ScoreTool } from "./ScoreTool";
import { ReviewFlowPreview } from "./ReviewFlowPreview";

export const metadata: Metadata = {
  title: "Free Local Growth Score",
  description:
    "Scan any local business in 30 seconds — see its Local Growth Score, how it compares to nearby businesses, and a real AI-drafted sample review. No signup, no card.",
};

const PILLARS: { title: string; body: string }[] = [
  {
    title: "Reviews",
    body: "Rating, volume, and how recently people are still posting — weighted for durability.",
  },
  {
    title: "Profile",
    body: "Photos, completeness, and how often you reply to the reviews you already have.",
  },
  {
    title: "Growth",
    body: "The blended 0–100 signal that tracks how findable and choosable you are locally.",
  },
];

export default function ScorePage() {
  return (
    <div>
      {/* ── Hero — live widget + review-flow preview (paper) ── */}
      <Band tone="paper">
        <Container className="grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          <div>
            <Eyebrow>Free · no account needed</Eyebrow>
            <h1 className="mt-4 text-[34px] font-extrabold leading-[1.06] tracking-tight text-ink sm:text-[44px]">
              Your free Local Growth Score
            </h1>
            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-sub">
              Enter your business and watch Foundly read your profile, count your reviews, compare you
              to the block, and draft a real sample review — live, in about 30 seconds.
            </p>
            <div className="mt-8">
              <ScoreTool />
            </div>
          </div>

          {/* Phone preview — desktop only, kept in view while the tool runs */}
          <div className="hidden lg:block">
            <div className="lg:sticky lg:top-24">
              <ReviewFlowPreview />
            </div>
          </div>
        </Container>
      </Band>

      {/* ── How the score works — white ──────────────────── */}
      <Band tone="white">
        <Container>
          <SectionHead
            eyebrow="How the score works"
            title="Three honest signals, one number"
            lede="No black box. The Growth Score blends three plainly-defined inputs — the same ones the app tracks every day."
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {PILLARS.map((p, i) => (
              <div key={p.title} className="rounded-card border border-hairline bg-paper p-6">
                <div className="data-chip text-faint">{String(i + 1).padStart(2, "0")}</div>
                <div className="mt-2 text-[16px] font-bold text-ink">{p.title}</div>
                <p className="mt-2 text-[13px] leading-relaxed text-sub">{p.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Band>

      {/* ── Trust row — paper ────────────────────────────── */}
      <Band tone="paper" className="py-12 sm:py-16">
        <Container>
          <TrustRow />
        </Container>
      </Band>

      {/* ── Close — deep-green ───────────────────────────── */}
      <CtaBand
        eyebrow="Start free"
        title="Get reviews like this every week"
        lede="Start free and Foundly runs the whole loop — asks at the right moment, drafts the first version, and keeps your profile climbing. No card for 30 days."
        actions={
          <>
            <LinkButton href="/sign-up" size="lg" icon="sparkles">Start 30-day trial</LinkButton>
            <LinkButton href="/pricing" size="lg" variant="secondary" className={heroSecondaryBtn}>
              See pricing
            </LinkButton>
          </>
        }
        footnote="30 days of every tool · no credit card · keep a free plan forever."
      />
    </div>
  );
}
