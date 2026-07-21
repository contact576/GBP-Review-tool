"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ds/Card";
import { Button, LinkButton } from "@/components/ds/Button";
import { Badge, EmptyState } from "@/components/ds/misc";
import { Checkbox } from "@/components/ds/form";
import { Icon } from "@/components/icons";
import { formatRelative } from "@/lib/utils/format";
import { sendAgencyReportsAction, type AgencyReportSendResult } from "@/lib/actions";
import type { AgencyClient } from "@/lib/data/types";

export function ReportsSender({
  clients,
  brandName,
  deliveryConnected,
}: {
  clients: AgencyClient[];
  brandName: string;
  deliveryConnected: boolean;
}) {
  const overdue = useMemo(
    () =>
      clients.filter(
        (client) =>
          !client.lastReportSent ||
          Date.now() - new Date(client.lastReportSent).getTime() > 14 * 86_400_000,
      ),
    [clients],
  );
  const [selected, setSelected] = useState(
    () => new Set((overdue.length ? overdue : clients).map((client) => client.locationId)),
  );
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AgencyReportSendResult | null>(null);

  function toggle(locationId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(locationId);
      else next.delete(locationId);
      return next;
    });
  }

  function sendSelected() {
    setResult(null);
    startTransition(async () => {
      const response = await sendAgencyReportsAction([...selected]);
      setResult(response);
    });
  }

  return (
    <Card>
      <CardHeader
        kicker="Deliverable"
        title="Branded Growth Report"
        action={
          <div className="flex items-center gap-2">
            <LinkButton href="/app/report" variant="secondary" size="sm" icon="file">
              Preview
            </LinkButton>
            <Button
              variant="primary"
              size="sm"
              icon="send"
              loading={pending}
              disabled={!selected.size || !deliveryConnected}
              onClick={sendSelected}
            >
              Send {selected.size || "selected"}
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-btn bg-primary-wash p-3 text-[12px] text-sub">
        <span className="flex min-w-0 items-start gap-2">
          <Icon name="file" size={16} className="mt-0.5 shrink-0 text-primary" />
          <span>
            A plain-English, {brandName}-branded recap of Growth Score, rating, new reviews, and
            outstanding replies. {overdue.length ? `${overdue.length} clients are overdue.` : "All clients are current."}
          </span>
        </span>
        <span className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set(overdue.map((client) => client.locationId)))}
          >
            Select overdue
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set(clients.map((client) => client.locationId)))}
          >
            Select all
          </Button>
        </span>
      </div>

      {!deliveryConnected ? (
        <div className="mb-4 flex items-start gap-2 rounded-btn border border-gold/30 bg-gold-tint p-3 text-[12px] text-gold-deep">
          <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
          Connect Resend and verify EMAIL_FROM to activate report delivery.
        </div>
      ) : null}
      {result ? (
        <div
          role="status"
          className={`mb-4 rounded-btn border p-3 text-[13px] font-medium ${
            result.ok
              ? "border-primary/25 bg-primary-wash text-primary-dark"
              : "border-danger/25 bg-danger-tint text-danger"
          }`}
        >
          {result.message}
        </div>
      ) : null}

      {clients.length ? (
        <ul className="divide-y divide-hairline">
          {clients.map((client) => (
            <li key={client.locationId} className="flex items-center gap-3 py-3">
              <Checkbox
                checked={selected.has(client.locationId)}
                onChange={(checked) => toggle(client.locationId, checked)}
                label={<span className="sr-only">Select {client.name}</span>}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink">{client.name}</div>
                <div className="truncate text-[12px] text-sub">
                  {client.city} · {client.contactEmail ?? "Contact email missing"} · Growth {client.growthScore}
                </div>
              </div>
              {client.lastReportSent ? (
                <span className="text-[12px] text-faint">Last sent {formatRelative(client.lastReportSent)}</span>
              ) : (
                <Badge tone="sub" icon="clock">Never sent</Badge>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon="users"
          title="No clients yet"
          description="Add an agency client before sending a branded report."
        />
      )}
    </Card>
  );
}
