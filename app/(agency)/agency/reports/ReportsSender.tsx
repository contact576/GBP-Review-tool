"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Card, CardHeader } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ds/Toast";
import { formatRelative } from "@/lib/utils/format";
import type { AgencyClient } from "@/lib/data/types";

type RowState = "idle" | "queued" | "sending" | "sent";

export function ReportsSender({ clients, brandName }: { clients: AgencyClient[]; brandName: string }) {
  const { toast } = useToast();
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);
  const sentCount = Object.values(states).filter((s) => s === "sent").length;

  async function sendAll() {
    setRunning(true);
    setStates(Object.fromEntries(clients.map((c) => [c.locationId, "queued" as RowState])));
    for (const c of clients) {
      setStates((s) => ({ ...s, [c.locationId]: "sending" }));
      await new Promise((r) => setTimeout(r, 550));
      setStates((s) => ({ ...s, [c.locationId]: "sent" }));
    }
    setRunning(false);
    toast(`Branded Growth Report sent to all ${clients.length} clients`, "success", "send");
  }

  function rowBadge(id: string, lastReportSent?: string) {
    const st = states[id] ?? "idle";
    if (st === "queued") return <Badge tone="sub" icon="clock">Queued</Badge>;
    if (st === "sending") return <Badge tone="primary" icon="send">Sending…</Badge>;
    if (st === "sent") return <Badge tone="primary" icon="check-circle">Sent just now</Badge>;
    return (
      <span className="text-[12px] text-faint">
        {lastReportSent ? `Last sent ${formatRelative(lastReportSent)}` : "Never sent"}
      </span>
    );
  }

  const stale = clients.filter((c) => {
    if (!c.lastReportSent) return true;
    return Date.now() - new Date(c.lastReportSent).getTime() > 14 * 86_400_000;
  }).length;

  return (
    <Card>
      <CardHeader
        kicker="Deliverable"
        title="Branded Growth Report"
        action={
          <Button variant="primary" icon="send" loading={running} onClick={sendAll}>
            {running ? "Sending…" : "Generate & send to all"}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-btn bg-primary-wash p-3 text-[12px] text-sub">
        <Icon name="file" size={16} className="shrink-0 text-primary" />
        <span>
          The Growth Report is the agency deliverable — a plain-English, {brandName}-branded monthly recap of found-you,
          contacted-you and new-review activity. {stale > 0 ? `${stale} client${stale === 1 ? "" : "s"} are overdue.` : "All clients are current."}
          {running || sentCount > 0 ? ` ${sentCount}/${clients.length} sent this run.` : ""}
        </span>
      </div>

      <ul className="divide-y divide-hairline">
        {clients.map((c) => {
          const st = states[c.locationId] ?? "idle";
          return (
            <li key={c.locationId} className={cn("flex items-center gap-3 py-3 transition-colors", st === "sending" && "bg-primary-wash/50")}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink">{c.name}</div>
                <div className="text-[12px] text-sub">{c.city} · Growth {c.growthScore}</div>
              </div>
              {rowBadge(c.locationId, c.lastReportSent)}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
