import type { Metadata } from "next";
import type { IconName } from "@/components/icons";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Badge, Kicker } from "@/components/ds/misc";

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
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 pb-12 pt-14 text-center sm:px-6 lg:pt-20">
        <Badge tone="gold" icon="building">For agencies &amp; resellers</Badge>
        <h1 className="mx-auto mt-5 max-w-3xl text-[34px] font-extrabold leading-[1.08] tracking-tight text-ink sm:text-[50px]">
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
      </section>

      {/* Wholesale economics */}
      <section className="border-y border-hairline bg-hero">
        <div className="on-hero mx-auto max-w-5xl px-4 py-14 text-white sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="kicker text-gold">The wholesale math</div>
            <h2 className="mt-2 text-[28px] font-extrabold tracking-tight sm:text-[34px]">Margin that widens with every client</h2>
            <p className="mt-3 text-[15px] text-white/75">
              Illustrative economics — you set your own retail price. The point: the spread is yours,
              and it compounds as your book grows.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <EconCard value="CA$49" label="Your wholesale rate" sub="per client location / month" />
            <EconCard value="CA$149" label="Typical retail price" sub="what clients happily pay" highlight />
            <EconCard value="CA$100" label="Margin per client" sub="× every location you run" />
          </div>
          <p className="mx-auto mt-8 max-w-xl text-center text-[14px] text-white/70">
            Run 25 locations at that spread and that&apos;s CA$2,500 in recurring monthly margin — from a
            product that runs itself.
          </p>
        </div>
      </section>

      {/* White-label ladder */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <Kicker>The white-label ladder</Kicker>
          <h2 className="mt-2 text-[28px] font-extrabold tracking-tight text-ink sm:text-[34px]">Four steps to a resell-ready business</h2>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {LADDER.map((l) => (
            <Card key={l.step} className="flex flex-col">
              <div className="data-chip text-gold-deep">{l.step}</div>
              <h3 className="mt-2 text-[17px] font-bold text-ink">{l.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-sub">{l.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section className="border-t border-hairline bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="max-w-2xl">
            <Kicker>What you get</Kicker>
            <h2 className="mt-2 text-[28px] font-extrabold tracking-tight text-ink sm:text-[34px]">
              A platform your clients think you built
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="flex gap-4 rounded-card border border-hairline bg-paper p-5">
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
        </div>
      </section>

      {/* Become agency #1 */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="rounded-card border border-primary/25 bg-primary-wash p-8 text-center sm:p-12">
          <div className="mx-auto grid size-14 place-items-center rounded-card bg-primary text-white">
            <Icon name="trophy" size={28} />
          </div>
          <h2 className="mx-auto mt-5 max-w-2xl text-[26px] font-extrabold leading-tight tracking-tight text-ink sm:text-[34px]">
            Become agency #1 in your market
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[15px] text-sub">
            The first agencies onboard get founding-partner pricing, priority roadmap input, and a
            head start owning local review growth in their region.
          </p>
          <div className="mt-7">
            <LinkButton href="/sign-in" size="lg" icon="building">Start as an agency</LinkButton>
          </div>
        </div>
      </section>
    </div>
  );
}

function EconCard({ value, label, sub, highlight }: { value: string; label: string; sub: string; highlight?: boolean }) {
  return (
    <div className={highlight ? "rounded-card bg-white/10 p-5 text-center ring-1 ring-gold/40" : "rounded-card bg-white/5 p-5 text-center ring-1 ring-white/10"}>
      <div className={highlight ? "text-[32px] font-extrabold tabular-nums text-gold" : "text-[32px] font-extrabold tabular-nums text-white"}>{value}</div>
      <div className="mt-1 text-[14px] font-semibold text-white">{label}</div>
      <div className="mt-0.5 text-[12px] text-white/60">{sub}</div>
    </div>
  );
}
