"use client";

import { useState, useTransition } from "react";
import { Button, LinkButton } from "@/components/ds/Button";
import { Icon } from "@/components/icons";
import { sendAgencyReportsAction } from "@/lib/actions";

export function ClientActions({
  brandName,
  clientId,
  contactEmail,
}: {
  brandName: string;
  clientId: string;
  contactEmail?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  function send() {
    startTransition(async () => {
      const result = await sendAgencyReportsAction([clientId]);
      setMessage(result.message);
    });
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <LinkButton href="/app/report" variant="primary" icon="file" className="sm:flex-1">
          Preview report
        </LinkButton>
        <Button
          variant="secondary"
          icon="send"
          fullWidth
          className="sm:flex-1"
          loading={pending}
          disabled={!contactEmail}
          onClick={send}
        >
          Send branded report
        </Button>
      </div>
      <p className="flex items-start gap-1.5 text-[12px] text-faint">
        <Icon name={contactEmail ? "mail" : "alert"} size={13} className="mt-px shrink-0" />
        {contactEmail
          ? `Deliver the ${brandName}-branded report to ${contactEmail}.`
          : "Add a valid client contact email before sending."}
      </p>
      {message ? <p role="status" className="text-[12px] font-medium text-sub">{message}</p> : null}
    </div>
  );
}
