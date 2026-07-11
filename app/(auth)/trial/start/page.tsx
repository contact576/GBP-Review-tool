import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Kicker } from "@/components/ds/misc";

export const metadata: Metadata = {
  title: "Start your free trial",
  description: "How the Foundly reverse trial works: 14 days of Growth free, no credit card, then keep a free plan forever.",
};

const STEPS: { icon: "gift" | "sparkles" | "shield"; title: string; body: string }[] = [
  { icon: "gift", title: "Day 0 — full Growth, free", body: "You start on the complete Growth plan with everything unlocked. No credit card, nothing to configure first." },
  { icon: "sparkles", title: "Days 1–14 — see it work", body: "Send requests, watch reviews land, and get your first Growth Report — with real numbers from your own business." },
  { icon: "shield", title: "Day 14 — you decide", body: "Nothing auto-charges. Stay on a paid plan, or drop to the free plan and keep your reviews, score, and QR kit." },
];

export default function TrialStartPage() {
  return (
    <Card raised>
      <div className="text-center">
        <Kicker>The reverse trial</Kicker>
        <h1 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight text-ink">
          Try everything first. Pay only if it works.
        </h1>
        <p className="mt-2 text-[14px] text-sub">
          Most tools make you pay to find out. We flip it — you get the full product free, then choose.
        </p>
      </div>

      <ol className="mt-6 space-y-3">
        {STEPS.map((s) => (
          <li key={s.title} className="flex gap-3 rounded-card border border-hairline bg-paper p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-tint text-primary-dark">
              <Icon name={s.icon} size={20} />
            </span>
            <div>
              <div className="text-[14px] font-bold text-ink">{s.title}</div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-sub">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6">
        <LinkButton href="/sign-up" size="lg" fullWidth icon="sparkles">Start free</LinkButton>
        <p className="mt-3 text-center text-[12px] text-faint">14 days of Growth · no credit card · cancel anytime</p>
      </div>

      <p className="mt-5 text-center text-[13px] text-sub">
        Want to see your baseline first?{" "}
        <Link href="/score" className="font-semibold text-primary hover:text-primary-dark">Run your free Growth Score</Link>
      </p>
    </Card>
  );
}
