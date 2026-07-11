"use client";

import { useState } from "react";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";

export function ClientActions({ clientName, brandName }: { clientName: string; brandName: string }) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  function sendReport() {
    setSending(true);
    setTimeout(() => {
      setSending(false);
      toast(`${brandName} report sent to ${clientName}`, "success", "send");
    }, 900);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" icon="file" loading={sending} onClick={sendReport} className="sm:flex-1">
          Send branded report
        </Button>
        <Button
          variant="secondary"
          icon="chat"
          onClick={() => toast(`Opening ${clientName}'s reviews (demo)`, "info", "chat")}
          className="sm:flex-1"
        >
          View reviews
        </Button>
      </div>
      <p className="flex items-start gap-1.5 text-[12px] text-faint">
        <span className="mt-px inline-block size-1.5 shrink-0 rounded-full bg-faint" />
        Action by agency admin (audited) — every impersonated action is logged to the immutable trail.
      </p>
    </div>
  );
}
