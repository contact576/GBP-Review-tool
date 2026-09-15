"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Badge, EmptyState } from "@/components/ds/misc";
import { Checkbox } from "@/components/ds/form";
import { Icon } from "@/components/icons";
import { formatRelative } from "@/lib/utils/format";
import { previewAgencyReportAction, sendAgencyReportsAction, type AgencyReportSendResult } from "@/lib/actions";
import type { AgencyClient } from "@/lib/data/types";
import { REPORT_OVERDUE_DAYS, clientGrowth, isReportOverdue } from "../../_components/portfolio";

export function ReportsSender({
  clients,
  brandName,
  deliveryConnected,
}: {
  clients: AgencyClient[];
  brandName: string;
  deliveryConnected: boolean;
}) {
  const now = useMemo(() => new Date(), []);
  const overdue = useMemo(() => clients.filter((client) => isReportOverdue(client, now)), [clients, now]);
  const [selected, setSelected] = useState(
    () => new Set((overdue.length ? overdue : clients).map((client) => client.locationId)),
  );
  const [pending, startTransition] = useTransition();
  const [previewing, startPreview] = useTransition();
  const [result, setResult] = useState<AgencyReportSendResult | null>(null);
  const [preview, setPreview] = useState<{ name: string; subject: string; html: string; to?: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

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

  function openPreview(client: AgencyClient) {
    setPreviewError(null);
    startPreview(async () => {
      const response = await previewAgencyReportAction(client.locationId);
      if (!response.ok) {
        setPreviewError(response.error);
        return;
      }
      setPreview({ name: client.name, subject: response.subject, html: response.html, to: response.to });
    });
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader
          kicker="Deliverable"
          title="Branded Growth Report"
          action={
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
          }
        />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-btn bg-primary-wash/70 p-3 text-[12px] text-sub">
          <span className="flex min-w-0 items-start gap-2">
            <Icon name="file" size={16} className="mt-0.5 shrink-0 text-primary" />
            <span>
              A plain-English, {brandName}-branded recap of Growth Score, rating, new reviews, and outstanding replies.{" "}
              {overdue.length
                ? `${overdue.length} client${overdue.length === 1 ? " is" : "s are"} overdue (no report in ${REPORT_OVERDUE_DAYS} days).`
                : "All clients are current."}
            </span>
          </span>
          <span className="flex shrink-0 gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set(overdue.map((client) => client.locationId)))}>
              Select overdue
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set(clients.map((client) => client.locationId)))}>
              Select all
            </Button>
          </span>
        </div>

        {!deliveryConnected ? (
          <div className="mb-4 flex items-start gap-2 rounded-btn border border-gold/30 bg-gold-tint p-3 text-[12px] text-gold-deep">
            <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
            No email sender is connected for the agency workspace, so nothing can be sent. Connect one under Settings → Channels in your own workspace (open it from the Overview).
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
          <ul className="divide-y divide-soft">
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
                    {client.city || "City not set"} · {client.contactEmail ?? <span className="text-gold-deep">contact email missing</span>} ·
                    Growth {clientGrowth(client) ?? "not measured"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {client.lastReportSent ? (
                    <span className={`text-[12px] tabular-nums ${isReportOverdue(client, now) ? "text-gold-deep" : "text-faint"}`}>
                      Sent {formatRelative(client.lastReportSent)}
                    </span>
                  ) : (
                    <Badge tone="sub" icon="clock">Never sent</Badge>
                  )}
                  <Button type="button" variant="ghost" size="sm" icon="eye" loading={previewing && preview?.name !== client.name} onClick={() => openPreview(client)}>
                    Preview
                  </Button>
                </div>
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

      <Card className="xl:sticky xl:top-24 xl:self-start">
        <CardHeader
          kicker="Preview"
          title={preview ? preview.name : "What the client receives"}
          action={preview?.to ? <Badge tone="neutral" icon="mail">to {preview.to}</Badge> : undefined}
        />
        {previewError ? <p role="alert" className="mb-3 text-[13px] font-medium text-danger">{previewError}</p> : null}
        {preview ? (
          <div className="space-y-3">
            <div className="rounded-btn bg-white/50 px-3 py-2 text-[13px]">
              <span className="text-faint">Subject · </span>
              <span className="font-semibold text-ink">{preview.subject}</span>
            </div>
            <iframe
              title={`Report preview for ${preview.name}`}
              srcDoc={preview.html}
              sandbox=""
              className="h-[560px] w-full rounded-card border border-soft bg-white"
            />
            <p className="text-[12px] text-faint">
              Rendered by the same template and the same live figures the send uses — what you see is what is delivered.
            </p>
          </div>
        ) : (
          <div className="grid h-[320px] place-items-center rounded-card border border-dashed border-ink/15 bg-white/30 text-center">
            <div className="max-w-[260px]">
              <Icon name="eye" size={22} className="mx-auto text-faint" />
              <p className="mt-2 text-[14px] font-semibold text-ink">Pick a client to preview</p>
              <p className="mt-1 text-[12px] text-sub">The exact email, in your branding, with that client&rsquo;s current numbers.</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
