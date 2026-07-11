import Link from "next/link";
import { Badge, LinkButton, ProgressRail } from "@/components/ds";
import { Icon } from "@/components/icons";

const DONE = [
  "Business matched on Google",
  "Google Business Profile connected",
  "Email invites turned on",
  "QR kit ready to print",
  "Test invite sent",
];

export default function FinishPage() {
  return (
    <div className="flex min-h-[calc(100dvh-57px)] flex-col">
      <div className="flex-1 space-y-6 pb-6 pt-6">
        <ProgressRail current={7} total={7} />

        <div className="flex flex-col items-center pt-4 text-center">
          <div className="grid size-16 place-items-center rounded-card bg-hero text-gold shadow-lg">
            <Icon name="trophy" size={32} />
          </div>
          <h1 className="mt-4 text-[26px] font-extrabold leading-tight text-ink">You&apos;re live!</h1>
          <p className="mt-1.5 text-[14px] text-sub">
            Harbourview Physiotherapy is set up to earn steady, durable reviews.
          </p>
        </div>

        <div className="rounded-card border border-hairline bg-card p-4 shadow-sm">
          <div className="kicker mb-3">Setup checklist</div>
          <ul className="space-y-2.5">
            {DONE.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-white">
                  <Icon name="check" size={14} />
                </span>
                <span className="text-[14px] text-sub line-through">{item}</span>
              </li>
            ))}
            <li className="-mx-2 flex items-center gap-3 rounded-btn bg-gold-tint px-2 py-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gold text-gold-deep">
                <Icon name="star-fill" size={14} />
              </span>
              <span className="flex-1 text-[14px] font-bold text-ink">Send your first real invite</span>
              <Badge tone="gold">Next</Badge>
            </li>
          </ul>
        </div>
      </div>

      <div className="sticky bottom-0 space-y-2 bg-gradient-to-t from-paper via-paper to-transparent pb-6 pt-3">
        <LinkButton href="/app" size="lg" fullWidth iconRight="arrow-right">
          Go to dashboard
        </LinkButton>
        <div className="text-center">
          <Link
            href="/app/settings/team"
            className="inline-flex min-h-[40px] items-center justify-center px-4 text-[13px] font-medium text-faint hover:text-sub"
          >
            Fine-tune settings first
          </Link>
        </div>
      </div>
    </div>
  );
}
