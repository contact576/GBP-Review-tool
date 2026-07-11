import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { LinkButton } from "@/components/ds/Button";
import { Badge, Kicker } from "@/components/ds/misc";
import { formatDate } from "@/lib/utils/format";
import { ARTICLES } from "./content";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Plain-English guides to local growth, review velocity, and getting named by AI search (AEO) — written for owners and the agencies who serve them.",
};

export default function ResourcesPage() {
  const [featured, ...rest] = ARTICLES;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="max-w-2xl">
        <Kicker>Resources</Kicker>
        <h1 className="mt-2 text-[32px] font-extrabold leading-tight tracking-tight text-ink sm:text-[42px]">
          Guides to getting found and chosen
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-sub">
          No fluff, no keyword stuffing — just the practical playbook for reviews, local rank, and
          the new world of AI search.
        </p>
      </div>

      {/* Featured */}
      {featured ? (
        <Link
          href={`/resources/${featured.slug}`}
          className="mt-10 block overflow-hidden rounded-card border border-hairline bg-card shadow-sm transition-colors hover:border-primary/40"
        >
          <div className="grid gap-6 p-6 sm:grid-cols-2 sm:items-center sm:p-8">
            <div className="order-2 sm:order-1">
              <Badge tone="gold">{featured.category}</Badge>
              <h2 className="mt-3 text-[24px] font-extrabold leading-tight tracking-tight text-ink sm:text-[28px]">
                {featured.title}
              </h2>
              <p className="mt-3 text-[14px] leading-relaxed text-sub">{featured.dek}</p>
              <div className="mt-4 flex items-center gap-3 text-[12px] text-faint">
                <span>{featured.readMins} min read</span>
                <span aria-hidden>·</span>
                <span>Updated {formatDate(featured.updated)}</span>
              </div>
              <span className="mt-5 inline-flex items-center gap-1 text-[14px] font-semibold text-primary">
                Read the guide <Icon name="arrow-right" size={16} />
              </span>
            </div>
            <div className="order-1 grid aspect-[16/10] place-items-center rounded-card bg-hero sm:order-2">
              <Icon name="compass" size={64} className="text-gold" />
            </div>
          </div>
        </Link>
      ) : null}

      {/* Grid */}
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((a) => (
          <Link
            key={a.slug}
            href={`/resources/${a.slug}`}
            className="flex flex-col rounded-card border border-hairline bg-card p-6 shadow-sm transition-colors hover:border-primary/40"
          >
            <Badge tone="primary">{a.category}</Badge>
            <h3 className="mt-3 text-[18px] font-bold leading-snug text-ink">{a.title}</h3>
            <p className="mt-2 flex-1 text-[13px] leading-relaxed text-sub">{a.dek}</p>
            <div className="mt-4 flex items-center gap-3 text-[12px] text-faint">
              <span>{a.readMins} min read</span>
              <span aria-hidden>·</span>
              <span>Updated {formatDate(a.updated)}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-14 rounded-card border border-primary/25 bg-primary-wash p-8 text-center">
        <h2 className="text-[22px] font-extrabold tracking-tight text-ink sm:text-[26px]">
          Want the score behind the theory?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] text-sub">
          Run your free Local Growth Score and see exactly where your reviews and profile stand today.
        </p>
        <div className="mt-5">
          <LinkButton href="/score" size="lg" icon="sparkles">Get my free Growth Score</LinkButton>
        </div>
      </div>
    </div>
  );
}
