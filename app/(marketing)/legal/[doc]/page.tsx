import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ds/misc";

interface LegalSection {
  heading: string;
  paragraphs: string[];
}

interface LegalDoc {
  title: string;
  summary: string;
  sections: LegalSection[];
}

const DOCS: Record<string, LegalDoc> = {
  privacy: {
    title: "Privacy Policy",
    summary: "How Foundly collects, uses, and protects information — including our CASL stance for Canadian customers.",
    sections: [
      {
        heading: "What we collect",
        paragraphs: [
          "We collect the information a business gives us to run its account: the business profile, staff names, the customer contacts it imports or captures, and the reviews and requests generated through the product. We also collect standard technical data such as device and usage logs to keep the service secure and reliable.",
        ],
      },
      {
        heading: "How we use it",
        paragraphs: [
          "We use this information to provide the service — sending review requests the customer has consented to receive, drafting suggested copy, computing scores, and producing reports. We do not sell personal information, and we do not use customer contacts for our own marketing.",
        ],
      },
      {
        heading: "Consent and CASL (Canada)",
        paragraphs: [
          "Foundly is built around explicit consent. Service messages are sent only where a customer has agreed to be contacted about their visit, and marketing messages require a separate, express opt-in. For Canadian customers, this reflects CASL: express consent is captured at the point of service, recorded with a timestamp and source, and is withdrawable at any time. Every message includes a clear way to unsubscribe.",
        ],
      },
      {
        heading: "Your choices",
        paragraphs: [
          "Businesses and their customers can request access to, correction of, or deletion of personal information. Consent can be withdrawn at any time, after which we suppress that contact from future messaging.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    summary: "The ground rules for using Foundly — fair use, honest reviews, and how the agreement works.",
    sections: [
      {
        heading: "Using the service",
        paragraphs: [
          "By creating an account you agree to use Foundly lawfully and in line with these terms. You're responsible for the accuracy of the information you add and for having permission to contact the customers you import.",
        ],
      },
      {
        heading: "Honest reviews only",
        paragraphs: [
          "Foundly may only be used to request genuine reviews from real customers. You may not incentivize, reward, filter, or gate reviews based on expected sentiment, and you may not edit your business name to add keywords. These practices violate platform policies and are grounds for suspension.",
        ],
      },
      {
        heading: "Plans, trials, and billing",
        paragraphs: [
          "Paid plans begin with a free trial that requires no credit card. When a trial ends without an upgrade, the account moves to a free plan — nothing auto-charges. Paid subscriptions renew on the interval you choose until cancelled, and you can change or cancel at any time.",
        ],
      },
      {
        heading: "Availability and liability",
        paragraphs: [
          "We work hard to keep Foundly available and accurate, but the service is provided \"as is.\" To the extent permitted by law, our liability is limited to the fees paid for the service in the preceding period.",
        ],
      },
    ],
  },
  dpa: {
    title: "Data Processing Addendum",
    summary: "How Foundly processes personal data on behalf of the businesses that use it.",
    sections: [
      {
        heading: "Roles",
        paragraphs: [
          "For the customer contacts and related personal data a business puts into Foundly, the business is the data controller and Foundly is the data processor. We process that data only on the business's documented instructions, which include operating the features it has enabled.",
        ],
      },
      {
        heading: "Security measures",
        paragraphs: [
          "We apply appropriate technical and organizational measures to protect personal data, including encryption in transit, access controls, and audit logging. Access to customer data is limited to personnel who need it to operate or support the service.",
        ],
      },
      {
        heading: "Sub-processors",
        paragraphs: [
          "We use a limited set of vetted sub-processors — for example, messaging and infrastructure providers — each bound by data-protection obligations consistent with this addendum. We maintain a current list and provide notice of material changes.",
        ],
      },
      {
        heading: "Assistance and deletion",
        paragraphs: [
          "We assist controllers with data-subject requests and, on termination, delete or return personal data in line with the controller's instructions and applicable law.",
        ],
      },
    ],
  },
  "ai-disclosure": {
    title: "AI Disclosure",
    summary: "Where Foundly uses AI, what it does, and the guardrails around it.",
    sections: [
      {
        heading: "Where AI is used",
        paragraphs: [
          "Foundly uses AI to draft suggested content: starting points for review requests, replies to reviews, campaign copy, profile tasks, and report narration. AI also helps summarize private feedback and estimate visibility in answer engines.",
        ],
      },
      {
        heading: "Drafts, not autopilot",
        paragraphs: [
          "AI output is always a starting point for a person to review and edit. Suggested reviews are written to be personalized by the actual customer in their own words — Foundly never posts a fabricated review, and never writes reviews on a customer's behalf without their genuine authorship.",
        ],
      },
      {
        heading: "Honesty and limits",
        paragraphs: [
          "AI can be wrong or generic, so we label AI-drafted content and encourage editing. We do not use AI to invent metrics, fabricate customer counts, or manufacture proof. The honesty commitments in the product — showing real actions rather than invented outcomes — apply to AI features just as they do everywhere else.",
        ],
      },
    ],
  },
};

const LABELS: Record<string, string> = {
  privacy: "Privacy",
  terms: "Terms",
  dpa: "DPA",
  "ai-disclosure": "AI disclosure",
};

const ORDER = ["privacy", "terms", "dpa", "ai-disclosure"];

export function generateStaticParams() {
  return ORDER.map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  const found = DOCS[doc];
  if (!found) return { title: "Legal" };
  return { title: found.title, description: found.summary };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const content = DOCS[doc];
  if (!content) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      {/* Doc switcher */}
      <nav className="flex flex-wrap gap-2" aria-label="Legal documents">
        {ORDER.map((key) => (
          <Link
            key={key}
            href={`/legal/${key}`}
            className={
              key === doc
                ? "rounded-chip bg-primary px-3 py-1.5 text-[13px] font-semibold text-white"
                : "rounded-chip border border-hairline bg-card px-3 py-1.5 text-[13px] font-medium text-sub hover:text-ink"
            }
          >
            {LABELS[key]}
          </Link>
        ))}
      </nav>

      <header className="mt-8">
        <Badge tone="neutral" icon="lock">Legal</Badge>
        <h1 className="mt-4 text-[32px] font-extrabold tracking-tight text-ink sm:text-[40px]">{content.title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-sub">{content.summary}</p>
        <p className="mt-2 text-[12px] text-faint">Last updated {new Date().getFullYear()} · Version 1.0</p>
      </header>

      {/* Template disclaimer */}
      <div className="mt-6 flex items-start gap-3 rounded-card border border-gold/40 bg-gold-tint p-4">
        <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-gold-deep" />
        <p className="text-[13px] leading-relaxed text-ink/80">
          This is a plain-language <strong>template</strong> for demonstration, not legal advice.
          Before relying on it, have a qualified lawyer adapt it to your business and jurisdiction.
        </p>
      </div>

      {/* Sections */}
      <div className="mt-10 space-y-9">
        {content.sections.map((section, i) => (
          <section key={section.heading}>
            <h2 className="text-[19px] font-bold text-ink">
              <span className="data-chip mr-2 text-faint">{String(i + 1).padStart(2, "0")}</span>
              {section.heading}
            </h2>
            <div className="mt-3 space-y-4">
              {section.paragraphs.map((p, j) => (
                <p key={j} className="text-[15px] leading-[1.7] text-sub">{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-12 border-t border-hairline pt-6 text-[13px] text-faint">
        Questions about this document? Reach us through your account or at the contact listed in your
        agreement.
      </p>
    </div>
  );
}
