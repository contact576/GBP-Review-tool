import type { Metadata } from "next";
import type { IconName } from "@/components/icons";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { LinkButton } from "@/components/ds/Button";
import { Band, Container, Eyebrow, SectionHead, CtaBand, heroSecondaryBtn } from "../_components/primitives";

export const metadata: Metadata = {
  title: "For agencies",
  description:
    "White-label Foundly and resell durable local-review growth to your clients. Wholesale economics, a client Growth-Report engine, and a brand that's entirely yours.",
};

const LADDER: { step: string; title: string; body: string }[] = [
  { step: "01", title: "Brand it", body: "Set your name, colors, logo, and domain. Clients never see Foundly — they see you, with contrast checked for accessibility." },
  { step: "02", title: "Onboard clients", body: "Spin up locations in minutes. Import customers, print QR kits, and the growth loop starts the same day." },
  { step: "03", title: "Report automatically", body: "The Growth-Report engine writes a plain-English monthly recap per client — sent under your brand, on schedule." },
  { step: "04", title: "Scale the book", body: "Wholesale pricing means every location you add widens your margin. Grow to dozens without growing headcount." },
];

const CAPABILITIES: { icon: IconName; title: string; body: string }[] = [
  { icon: "shield", title: "White-label everything", body: "Your brand on the dashboard, the reports, the emails, and the review pages. A validated contrast check keeps it accessible." },
  { icon: "file", title: "Growth-Report engine", body: "Every client gets an automated monthly report — honest numbers, narrated in plain English, delivered as you." },
  { icon: "users", title: "Multi-client command center", body: "One roll-up view of every location: scores, ratings, reviews needing replies, and who needs attention this week." },
  { icon: "credit-card", title: "Wholesale economics", body: "Pay a flat wholesale rate per client, set your own retail price, and keep the spread. Predictable, expanding margin." },
];

export default function AgenciesPage() {
  return (
    <div>
      {/* ── Hero — paper ─────────────────────────────────── */}
      <Band tone="paper">
        <Container size="md" className="text-center">
          <Eyebrow className="justify-center">For agencies &amp; resellers</Eyebrow>
          <h1 className="mx-auto mt-4 max-w-3xl text-[34px] font-extrabold leading-[1.08] tracking-tight text-ink sm:text-[50px]">
            Resell local growth under your own brand
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-sub sm:text-[18px]">
            Foundly gives agencies a white-label platform, wholesale pricing, and an automated
            Growth-Report engine — so you can run durable review growth for dozens of local clients
            without building any of it yourself.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <LinkButton href="/sign-in" size="lg" icon="building">Start as an agency</LinkButton>
            <LinkButton href="/pricing" size="lg" variant="secondary" iconRight="chevron-right">See agency pricing</LinkButton>
          </div>
          <p className="mt-4 text-[13px] text-faint">Sign in offers a live agency demo — no setup required.</p>
        </Container>
      </Band>

      {/* ── Wholesale economics — white spec cells ───────── */}
      <Band tone="white">
        <Container size="md">
          <SectionHead
            eyebrow="The wholesale math"
            title="Margin that widens with every client"
            lede="Illustrative economics — you set your own retail price. The point: the spread is yours, and it compounds as your book grows."
            align="center"
          />
          <div className="mt-10 grid grid-cols-1 divide-y divide-hairline rounded-card border border-hairline bg-paper sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <EconCell value="CA$49" label="Your wholesale rate" sub="per client location / month" />
            <EconCell value="CA$149" label="Typical retail price" sub="what clients happily pay" highlight />
            <EconCell value="CA$100" label="Margin per client" sub="× every location you run" />
          </div>
          <p className="mx-auto mt-6 max-w-xl text-center text-[14px] text-sub">
            Run 25 locations at that spread and that&apos;s CA$2,500 in recurring monthly margin — from a
            product that runs itself.
          </p>
        </Container>
      </Band>

      {/* ── White-label ladder — paper ───────────────────── */}
      <Band tone="paper">
        <Container>
          <SectionHead eyebrow="The white-label ladder" title="Four steps to a resell-ready business" align="center" />
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {LADDER.map((l) => (
              <div key={l.step} className="flex flex-col rounded-card border border-hairline bg-card p-6">
                <div className="data-chip text-primary-dark">{l.step}</div>
                <h3 className="mt-2 text-[17px] font-bold text-ink">{l.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-sub">{l.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Band>

      {/* ── Capabilities — white ─────────────────────────── */}
      <Band tone="white">
        <Container>
          <SectionHead eyebrow="What you get" title="A platform your clients think you built" />
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="flex gap-4 rounded-card border border-hairline bg-paper p-6">
                <div className="grid size-12 shrink-0 place-items-center rounded-btn bg-primary-tint text-primary-dark">
                  <Icon name={c.icon} size={24} />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-ink">{c.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-sub">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </Band>

      {/* ── Close — deep-green ───────────────────────────── */}
      <CtaBand
        eyebrow="Founding partners"
        title="Become agency #1 in your market"
        lede="The first agencies to onboard get founding-partner pricing, priority roadmap input, and a head start owning local review growth in their region."
        actions={
          <>
            <LinkButton href="/sign-in" size="lg" icon="building">Start as an agency</LinkButton>
            <LinkButton href="/pricing" size="lg" variant="secondary" className={heroSecondaryBtn}>
              See agency pricing
            </LinkButton>
          </>
        }
      />
    </div>
  );
}

function EconCell({ value, label, sub, highlight }: { value: string; label: string; sub: string; highlight?: boolean }) {
  return (
    <div className="px-4 py-5 text-center sm:py-6">
      <div className={cn("text-[34px] font-extrabold tabular-nums tracking-tight", highlight ? "text-primary-dark" : "text-ink")}>
        {value}
      </div>
      <div className="mt-1 text-[14px] font-semibold text-ink">{label}</div>
      <div className="mt-0.5 text-[12px] text-sub">{sub}</div>
    </div>
  );
}
