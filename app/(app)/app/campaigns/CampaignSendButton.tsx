"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import { sendCampaignAction } from "@/lib/actions";

/**
 * Send (or retry) a saved campaign.
 *
 * The toast repeats whatever the server action reports, verbatim. It never
 * says "Sent!" on its own initiative — if the keys are missing or a gate
 * refused, the owner reads that instead.
 */
export function CampaignSendButton({
  campaignId,
  label,
  variant = "primary",
  size = "md",
  fullWidth,
}: {
  campaignId: string;
  label: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function send() {
    start(async () => {
      const result = await sendCampaignAction(campaignId);
      setNote(result.note);
      toast(result.note, result.ok ? "success" : "warning", result.ok ? "send" : "alert");
      router.refresh();
    });
  }

  return (
    <div className={fullWidth ? "w-full space-y-2" : "space-y-2"}>
      <Button
        onClick={send}
        loading={pending}
        icon="send"
        variant={variant}
        size={size}
        fullWidth={fullWidth}
      >
        {label}
      </Button>
      {note ? <p className="text-[13px] text-sub">{note}</p> : null}
    </div>
  );
}
