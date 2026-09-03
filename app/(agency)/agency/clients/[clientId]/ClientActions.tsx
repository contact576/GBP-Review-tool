"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ds/Button";
import { Icon } from "@/components/icons";
import { enterClientWorkspaceAction, sendAgencyReportsAction } from "@/lib/actions";

export function ClientActions({
  brandName,
  clientId,
  contactEmail,
  canOpen = true,
}: {
  brandName: string;
  clientId: string;
  contactEmail?: string;
  /** False when the client's workspace can no longer be read. */
  canOpen?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [opening, startOpen] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function send() {
    startTransition(async () => {
      const result = await sendAgencyReportsAction([clientId]);
      setMessage(result.message);
    });
  }

  function open() {
    setMessage(null);
    startOpen(async () => {
      // On success the action redirects into the client's console and never
      // returns; only a refusal comes back here.
      const result = await enterClientWorkspaceAction(clientId);
      if (result && !result.ok) setMessage(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="primary"
          icon="external"
          fullWidth
          className="sm:flex-1"
          loading={opening}
          disabled={pending || !canOpen}
          onClick={open}
        >
          Open client workspace
        </Button>
        <Button
          variant="secondary"
          icon="send"
          fullWidth
          className="sm:flex-1"
          loading={pending}
          disabled={!contactEmail || opening}
          onClick={send}
        >
          Send branded report
        </Button>
      </div>
      <p className="flex items-start gap-1.5 text-[12px] text-faint">
        <Icon name="users" size={13} className="mt-px shrink-0" />
        Open the workspace to work on reviews, requests, the profile, Rank Grid and AI Visibility as this client.
      </p>
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
