"use client";

import { useFormStatus } from "react-dom";
import { Button, Card } from "@/components/ds";
import { Icon } from "@/components/icons";

function PreviewButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" fullWidth icon="external" loading={pending}>
      {pending ? "Creating your test request…" : "Preview your review page"}
    </Button>
  );
}

/**
 * Honest test flow: instead of pretending to send an email (email delivery
 * isn't configured yet), this mints a REAL test review request in the
 * workspace and opens the live customer page for it.
 */
export function TestInvitePanel({ action }: { action: () => Promise<void> }) {
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
            <Icon name="external" size={20} />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-ink">See what customers see</div>
            <div className="text-[13px] text-sub">
              Opens the live review page customers land on when they tap your QR or invite link.
            </div>
          </div>
        </div>
        <form action={action}>
          <PreviewButton />
        </form>
        <p className="flex items-start gap-1.5 text-[12px] text-faint">
          <Icon name="shield" size={13} className="mt-0.5 shrink-0" />
          This creates a real test request in your account — you&apos;ll see it in Requests, marked
          as your own.
        </p>
      </Card>

      <div className="flex items-start gap-2 rounded-btn border border-hairline bg-card px-3 py-2.5 text-[12px] text-sub">
        <Icon name="mail" size={15} className="mt-0.5 shrink-0 text-primary" />
        <span>
          Email delivery isn&apos;t connected yet — once it is, test invites arrive in your inbox
          exactly as customers get them.
        </span>
      </div>
    </div>
  );
}
