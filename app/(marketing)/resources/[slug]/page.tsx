import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { LinkButton } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { formatDate } from "@/lib/utils/format";
import { ARTICLES, getArticle } from "../content";

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return { title: "Resource not found" };
  return { title: article.title, description: article.dek };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const related = ARTICLES.filter((a) => a.slug !== article.slug).slice(0, 2);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <Link href="/resources" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-sub hover:text-ink">
        <Icon name="chevron-left" size={16} /> All resources
      </Link>

      <article className="mt-6">
        <header>
          <Badge tone="gold">{article.category}</Badge>
          <h1 className="mt-4 text-[30px] font-extrabold leading-[1.1] tracking-tight text-ink sm:text-[40px]">
            {article.title}
          </h1>
          <p className="mt-4 text-[17px] leading-relaxed text-sub">{article.dek}</p>
          <div className="mt-4 flex items-center gap-3 text-[12px] text-faint">
            <span>{article.readMins} min read</span>
            <span aria-hidden>·</span>
            <span>Updated {formatDate(article.updated)}</span>
          </div>
        </header>

        {/* Takeaways */}
        <div className="mt-8 rounded-card border border-hairline bg-card p-5 sm:p-6">
          <div className="kicker mb-3">Key takeaways</div>
          <ul className="space-y-2.5">
            {article.takeaways.map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[14px] text-ink/90">
                <Icon name="check-circle" size={18} className="mt-0.5 shrink-0 text-primary" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Body */}
        <div className="mt-10 space-y-10">
          {article.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-[22px] font-extrabold tracking-tight text-ink">{section.heading}</h2>
              <div className="mt-3 space-y-4">
                {section.paragraphs.map((p, i) => (
                  <p key={i} className="text-[16px] leading-[1.7] text-sub">{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-10 rounded-card border border-hairline bg-primary-wash/50 p-4 text-[13px] text-faint">
          This guide is general education, not legal, tax, or compliance advice for your specific
          situation. When a policy question is on the line, check the platform&apos;s official
          guidelines.
        </p>
      </article>

      {/* CTA */}
      <div className="mt-12 on-hero rounded-card bg-hero px-6 py-10 text-center text-white shadow-lg">
        <h2 className="text-[22px] font-extrabold tracking-tight sm:text-[26px]">Put it into practice</h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] text-white/75">
          See where you stand today with a free Local Growth Score — reviews, profile, and how you
          compare to the block.
        </p>
        <div className="mt-5">
          <LinkButton href="/score" size="lg" variant="gold" icon="sparkles">Get my free Growth Score</LinkButton>
        </div>
      </div>

      {/* Related */}
      {related.length ? (
        <div className="mt-14">
          <div className="kicker mb-4">Keep reading</div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {related.map((a) => (
              <Link
                key={a.slug}
                href={`/resources/${a.slug}`}
                className="flex flex-col rounded-card border border-hairline bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
              >
                <Badge tone="primary">{a.category}</Badge>
                <h3 className="mt-2.5 text-[16px] font-bold leading-snug text-ink">{a.title}</h3>
                <p className="mt-1.5 text-[13px] text-sub">{a.dek}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
