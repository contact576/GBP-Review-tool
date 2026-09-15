"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import { sendAgencyReportsAction, syncAllAgencyClientsAction } from "@/lib/actions";

/**
 * The two portfolio-wide moves on the overview: refresh every linked client
 * from Google, and send the branded report to everyone who is overdue.
 * Both report exactly what happened (synced / failed / skipped), never a
 * blanket "done".
 */
export function PortfolioActions({
  enabled,
  linkedCount,
  overdueIds,
  deliveryConnected,
}: {
  enabled: boolean;
  linkedCount: number;
  overdueIds: string[];
  deliveryConnected: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [syncing, startSync] = useTransition();
  const [sending, startSend] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function syncAll() {
    setNote(null);
    startSync(async () => {
      const result = await syncAllAgencyClientsAction();
      setNote(result.message);
      toast(result.ok ? "Clients synced" : "Sync finished with problems", result.ok ? "success" : "warning", result.ok ? "refresh" : "alert");
      router.refresh();
    });
  }

  function sendOverdue() {
    setNote(null);
    startSend(async () => {
      const result = await sendAgencyReportsAction(overdueIds);
      setNote(result.message);
      toast(result.ok ? "Reports sent" : "Reports not sent", result.ok ? "success" : "warning", result.ok ? "send" : "alert");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon="refresh"
          loading={syncing}
          disabled={!enabled || !linkedCount || sending}
          onClick={syncAll}
          title={!linkedCount ? "No client has a linked Google listing yet" : undefined}
        >
          Sync {linkedCount ? `${linkedCount} linked` : "clients"}
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon="send"
          loading={sending}
          disabled={!enabled || !overdueIds.length || !deliveryConnected || syncing}
          onClick={sendOverdue}
          title={!deliveryConnected ? "Connect an email sender before sending reports" : undefined}
        >
          Send {overdueIds.length ? `${overdueIds.length} overdue` : "reports"}
        </Button>
      </div>
      {note ? <p role="status" className="text-[12px] font-medium text-sub">{note}</p> : null}
    </div>
  );
}
