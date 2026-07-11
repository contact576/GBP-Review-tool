"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";
import { customersToCsv, downloadCsv } from "@/lib/utils/csv";
import { resetDemoAction } from "@/lib/actions";
import type { Customer } from "@/lib/data/types";

/** Data-portability + demo-control actions for billing. */
export function BillingActions({ customers }: { customers: Customer[] }) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [resetting, setResetting] = useState(false);

  function exportCsv() {
    const csv = customersToCsv(customers);
    downloadCsv("foundly-customers.csv", csv);
    toast(`Exported ${customers.length} customers`, "success", "download");
  }

  function resetDemo() {
    setResetting(true);
    startTransition(async () => {
      await resetDemoAction();
      toast("Demo data reset", "success", "refresh");
      setTimeout(() => window.location.reload(), 600);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" icon="download" onClick={exportCsv}>
        Export customer CSV
      </Button>
      <Button variant="ghost" icon="refresh" onClick={resetDemo} loading={resetting || pending}>
        Reset demo data
      </Button>
    </div>
  );
}

/** Honest cancel path — always routes to pause/downgrade, never hides the option. */
export function CancelPath() {
  const { toast } = useToast();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        toast("Opening pause & downgrade options — nothing is deleted", "info", "clock")
      }
    >
      Pause or cancel plan
    </Button>
  );
}
