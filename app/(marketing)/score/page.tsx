import type { Metadata } from "next";
import { Kicker, Badge } from "@/components/ds/misc";
import { ScoreTool } from "./ScoreTool";

export const metadata: Metadata = {
  title: "Free Local Growth Score",
  description:
    "Scan any local business in 30 seconds — see its Local Growth Score, how it compares to nearby businesses, and a real AI-drafted sample review. No signup, no card.",
};

export default function ScorePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="text-center">
        <Badge tone="gold" icon="sparkles">Free · no account needed</Badge>
        <h1 className="mt-4 text-[32px] font-extrabold leading-tight tracking-tight text-ink sm:text-[42px]">
          Your free Local Growth Score
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-sub">
          Enter your business and watch Foundly read your profile, count your reviews, compare you to
          the block, and draft a real sample review — live, in about 30 seconds.
        </p>
      </div>

      <div className="mt-10">
        <ScoreTool />
      </div>

      <div className="mt-12 border-t border-hairline pt-8">
        <Kicker>How the score works</Kicker>
        <div className="mt-4 grid gap-6 sm:grid-cols-3">
          <div>
            <div className="text-[14px] font-bold text-ink">Reviews</div>
            <p className="mt-1 text-[13px] text-sub">Rating, volume, and how recently people are still posting — weighted for durability.</p>
          </div>
          <div>
            <div className="text-[14px] font-bold text-ink">Profile</div>
            <p className="mt-1 text-[13px] text-sub">Photos, completeness, and how often you reply to the reviews you already have.</p>
          </div>
          <div>
            <div className="text-[14px] font-bold text-ink">Growth</div>
            <p className="mt-1 text-[13px] text-sub">The blended 0–100 signal that tracks how findable and choosable you are locally.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
