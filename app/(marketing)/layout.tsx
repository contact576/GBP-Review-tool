import Link from "next/link";
import { Wordmark } from "@/components/app/AppShell";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { SiteNav } from "./_components/SiteNav";

const FOOTER: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Free Growth Score", href: "/score" },
      { label: "Pricing", href: "/pricing" },
      { label: "For agencies", href: "/agencies" },
      { label: "Resources", href: "/resources" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Physiotherapy", href: "/for/physiotherapy" },
      { label: "Chiropractic", href: "/for/chiropractic" },
      { label: "Dental", href: "/for/dental" },
      { label: "HVAC", href: "/for/hvac" },
      { label: "Renovation", href: "/for/renovation" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Product tour", href: "/" },
      { label: "Start free", href: "/sign-up" },
      { label: "Sign in", href: "/sign-in" },
      { label: "Guides", href: "/resources" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
      { label: "DPA", href: "/legal/dpa" },
      { label: "AI disclosure", href: "/legal/ai-disclosure" },
    ],
  },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <SiteNav />
      <main id="main" className="flex-1">{children}</main>

      <footer className="border-t border-hairline bg-card">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
            <div className="col-span-2 md:col-span-1">
              <Wordmark />
              <p className="mt-3 max-w-[220px] text-[13px] text-sub">
                Get found and get chosen — steady reviews, an optimized profile, honest proof.
              </p>
            </div>
            {FOOTER.map((col) => (
              <div key={col.title}>
                <div className="kicker mb-3">{col.title}</div>
                <ul className="space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link href={l.href} className="text-[13px] text-sub transition-colors hover:text-ink">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t border-hairline pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] font-semibold text-ink">{MICROCOPY.poweredByFoundly}</p>
            <p className="text-[12px] text-faint">
              © {new Date().getFullYear()} Foundly · {MICROCOPY.actionsNotCustomers}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
