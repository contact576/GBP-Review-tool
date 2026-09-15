"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Table, type Column } from "@/components/ds/Table";
import { useToast } from "@/components/ds/Toast";
import { formatRelative } from "@/lib/utils/format";
import { triageFraudFlagAction } from "@/lib/actions";
import type { FraudFlag, FraudTriageDecision } from "@/lib/data/types";
import { SeverityBadge } from "../../_components/Severity";
import { HonestNote } from "../../_components/telemetry";

const KIND_LABEL: Record<FraudFlag["kind"], string> = {
  same_device: "Same device",
  staff_self_review: "Staff self-review",
  velocity_anomaly: "Velocity anomaly",
};

function TriageButtons({ flag, enabled }: { flag: FraudFlag; enabled: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [acting, setActing] = useState<FraudTriageDecision | null>(null);

  function decide(decision: FraudTriageDecision) {
    if (!flag.workspaceId) return;
    setActing(decision);
    start(async () => {
      const result = await triageFraudFlagAction(flag.id, flag.workspaceId!, decision);
      setActing(null);
      if (!result.ok) {
        toast(result.error, "danger", "alert");
        return;
      }
      toast(
        decision === "confirmed" ? `Confirmed — ${flag.tenant} has been told` : "Dismissed",
        decision === "confirmed" ? "warning" : "info",
        decision === "confirmed" ? "flag" : "check",
      );
      router.refresh();
    });
  }

  return (
    <span className="inline-flex gap-1.5">
      <Button
        size="sm"
        variant="ghost"
        icon="check"
        loading={pending && acting === "dismissed"}
        disabled={!enabled || pending}
        onClick={() => decide("dismissed")}
        aria-label={`Dismiss flag for ${flag.tenant}`}
      >
        Dismiss
      </Button>
      <Button
        size="sm"
        variant="danger"
        icon="flag"
        loading={pending && acting === "confirmed"}
        disabled={!enabled || pending}
        onClick={() => decide("confirmed")}
        aria-label={`Confirm flag for ${flag.tenant}`}
      >
        Confirm
      </Button>
    </span>
  );
}

/**
 * The live queue plus the decisions already taken. Flags are recomputed on
 * every load; a decision is keyed by the flag's stable id, so a dismissed
 * flag stays dismissed tomorrow and a confirmed one stays on the record.
 */
export function FraudTriageQueue({
  open,
  triaged,
  canTriage,
}: {
  open: FraudFlag[];
  triaged: FraudFlag[];
  canTriage: boolean;
}) {
  const base: Column<FraudFlag>[] = [
    {
      key: "tenant",
      header: "Tenant",
      render: (f) => <span className="text-[14px] font-semibold text-ink">{f.tenant}</span>,
    },
    {
      key: "kind",
      header: "Signal",
      render: (f) => <Badge tone="neutral">{KIND_LABEL[f.kind]}</Badge>,
    },
    {
      key: "detail",
      header: "Detail",
      render: (f) => <span className="text-[13px] text-sub">{f.detail}</span>,
    },
    {
      key: "severity",
      header: "Severity",
      render: (f) => <SeverityBadge sev={f.severity} />,
    },
    {
      key: "at",
      header: "When",
      render: (f) => <span className="text-[13px] tabular-nums text-sub">{formatRelative(f.at)}</span>,
    },
  ];

  const openColumns: Column<FraudFlag>[] = [
    ...base,
    {
      key: "triage",
      header: "Triage",
      align: "right",
      render: (f) => <TriageButtons flag={f} enabled={canTriage && Boolean(f.workspaceId)} />,
    },
  ];

  const triagedColumns: Column<FraudFlag>[] = [
    ...base,
    {
      key: "decision",
      header: "Decision",
      align: "right",
      render: (f) =>
        f.triage ? (
          <span className="inline-flex flex-col items-end gap-0.5">
            {f.triage.decision === "confirmed" ? (
              <Badge tone="danger" icon="flag">Confirmed</Badge>
            ) : (
              <Badge tone="sub" icon="check">Dismissed</Badge>
            )}
            <span className="text-[11px] text-faint">
              {f.triage.operator} · {formatRelative(f.triage.at)}
            </span>
          </span>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Table
          columns={openColumns}
          data={open}
          rowKey={(f) => f.id}
          caption="Fraud queue — open capture signals"
          emptyIcon="shield"
          emptyTitle="Queue clear"
          emptyDescription="The detectors ran over every real tenant and found nothing awaiting a decision."
        />
        <HonestNote>
          Dismiss records that you looked and it is fine; the flag stays out of the queue. Confirm writes an entry to the
          tenant&rsquo;s own audit log and drops a notification in their console describing the pattern, so they can
          change how requests are sent. Neither changes any tenant data.
        </HonestNote>
      </div>

      {triaged.length ? (
        <div className="space-y-2">
          <div className="kicker text-faint">Already triaged</div>
          <Table columns={triagedColumns} data={triaged} rowKey={(f) => f.id} caption="Triaged fraud flags" />
        </div>
      ) : null}
    </div>
  );
}
