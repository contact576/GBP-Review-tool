"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Chip, Badge } from "@/components/ds/misc";
import { Field, Select } from "@/components/ds/form";
import { Tabs, type TabItem } from "@/components/ds/Tabs";
import { Drawer } from "@/components/ds/Drawer";
import { useToast } from "@/components/ds/Toast";
import { Icon, type IconName } from "@/components/icons";
import { FunnelBar } from "@/components/charts/Bars";
import { funnelCounts } from "@/lib/data/selectors";
import { canSendService } from "@/lib/compliance/consent";
import { formatRelative } from "@/lib/utils/format";
import { sendRequestAction } from "@/lib/actions";
import type { ReviewRequest, RequestStatus, Customer, Channel } from "@/lib/data/types";

type TabKey = "all" | "notasked" | "sent" | "opened" | "reviewed" | "suppressed";

const BUCKET: Record<RequestStatus, Exclude<TabKey, "all">> = {
  queued: "notasked",
  sent: "sent",
  delivered: "sent",
  opened: "opened",
  clicked: "opened",
  posted_google: "reviewed",
  private_feedback: "reviewed",
  suppressed: "suppressed",
  failed: "suppressed",
};

const STATUS_META: Record<RequestStatus, { label: string; tone: "neutral" | "primary" | "gold" | "danger" | "sub" }> = {
  queued: { label: "Not asked", tone: "sub" },
  sent: { label: "Sent", tone: "neutral" },
  delivered: { label: "Delivered", tone: "neutral" },
  opened: { label: "Opened", tone: "primary" },
  clicked: { label: "Clicked", tone: "primary" },
  posted_google: { label: "Reviewed", tone: "gold" },
  private_feedback: { label: "Private feedback", tone: "sub" },
  suppressed: { label: "Suppressed", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
};

const CHANNEL_ICON: Record<Channel, IconName> = {
  email: "mail",
  sms: "message",
  whatsapp: "message",
};

export function RequestsView({
  requests,
  customers,
  locationId,
}: {
  requests: ReviewRequest[];
  customers: Customer[];
  locationId: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [tab, setTab] = useState<TabKey>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pickedCustomer, setPickedCustomer] = useState("");
  const [channel, setChannel] = useState<Channel>("email");

  const customerById = useMemo(() => {
    const m = new Map<string, Customer>();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);

  const funnel = funnelCounts(requests);
  const stages = [
    { label: "Sent", value: funnel.sent },
    { label: "Delivered", value: funnel.delivered },
    { label: "Opened", value: funnel.opened },
    { label: "Clicked", value: funnel.clicked },
    { label: "Posted", value: funnel.posted },
  ];

  const counts = useMemo(() => {
    const base: Record<Exclude<TabKey, "all">, number> = {
      notasked: 0, sent: 0, opened: 0, reviewed: 0, suppressed: 0,
    };
    for (const r of requests) base[BUCKET[r.status]] += 1;
    return base;
  }, [requests]);

  const tabs: TabItem[] = [
    { key: "all", label: "All", count: requests.length },
    { key: "notasked", label: "Not asked", count: counts.notasked },
    { key: "sent", label: "Sent", count: counts.sent },
    { key: "opened", label: "Opened", count: counts.opened },
    { key: "reviewed", label: "Reviewed", count: counts.reviewed },
    { key: "suppressed", label: "Suppressed", count: counts.suppressed },
  ];

  const filtered = useMemo(
    () => (tab === "all" ? requests : requests.filter((r) => BUCKET[r.status] === tab)),
    [requests, tab],
  );

  // Customers who have never had a request and aren't suppressed.
  const requestable = useMemo(() => {
    const asked = new Set(requests.map((r) => r.customerId));
    return customers.filter((c) => !asked.has(c.id) && !c.suppressedReason);
  }, [requests, customers]);

  function send() {
    if (!pickedCustomer) return;
    const cust = customerById.get(pickedCustomer);
    start(async () => {
      await sendRequestAction({ locationId, customerId: pickedCustomer, channel });
      toast(`Request sent to ${cust?.name ?? "customer"}`, "success", "send");
      setDrawerOpen(false);
      setPickedCustomer("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Funnel */}
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold text-ink">Ask → posted</h2>
          </div>
          <Button icon="send" onClick={() => setDrawerOpen(true)}>Send request</Button>
        </div>
        <FunnelBar stages={stages} />
      </Card>

      <Tabs items={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} />

      {/* Rows */}
      {filtered.length ? (
        <div className="space-y-2.5">
          {filtered.map((r) => {
            const cust = customerById.get(r.customerId);
            const meta = STATUS_META[r.status];
            const serviceOk = cust ? canSendService(cust) : false;
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-chip bg-primary-tint text-primary-dark">
                      <Icon name={CHANNEL_ICON[r.channel]} size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold text-ink">{r.customerName}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-faint">
                        <span className="capitalize">{r.channel}</span>
                        {r.sentAt ? <span>· sent {formatRelative(r.sentAt)}</span> : <span>· not sent yet</span>}
                      </div>
                    </div>
                  </div>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge tone={serviceOk ? "primary" : "sub"} icon={serviceOk ? "check" : "x"}>
                    {serviceOk ? "Service consent" : "No service consent"}
                  </Badge>
                  {r.rating ? (
                    <Badge tone="gold" icon="star-fill">{r.rating}★</Badge>
                  ) : null}
                </div>

                {r.status === "suppressed" && r.suppressedReason ? (
                  <div className="mt-2 flex items-start gap-2 rounded-btn border border-hairline bg-paper px-3 py-2">
                    <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-faint" />
                    <p className="text-[13px] text-sub">
                      Suppressed — <span className="font-medium text-ink">{r.suppressedReason}</span>. We don&apos;t re-ask when it isn&apos;t appropriate.
                    </p>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <p className="py-8 text-center text-[14px] text-faint">No requests in this view.</p>
        </Card>
      )}

      {/* Send drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Send a review request"
        footer={
          <Button onClick={send} loading={pending} disabled={!pickedCustomer} icon="send" fullWidth>
            Send request
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Customer" hint="Only customers you haven't asked yet appear here.">
            <Select value={pickedCustomer} onChange={(e) => setPickedCustomer(e.target.value)}>
              <option value="">Choose a customer…</option>
              {requestable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {canSendService(c) ? "" : " (no service consent)"}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <span className="mb-1.5 block text-[14px] font-semibold text-ink">Channel</span>
            <div className="flex flex-wrap gap-2">
              <Chip selected={channel === "email"} onClick={() => setChannel("email")} icon="mail">
                Email
              </Chip>
              <Chip selected={channel === "sms"} onClick={() => setChannel("sms")} icon="message">
                SMS
              </Chip>
            </div>
          </div>

          {pickedCustomer && !canSendService(customerById.get(pickedCustomer)!) ? (
            <div className="flex items-start gap-2 rounded-btn border border-gold/40 bg-gold-tint/50 px-3 py-2">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-gold-deep" />
              <p className="text-[13px] text-sub">
                This customer hasn&apos;t given service-message consent. Confirm consent before sending.
              </p>
            </div>
          ) : null}

          {requestable.length === 0 ? (
            <p className="text-[14px] text-faint">Everyone eligible has already been asked. Nice work.</p>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}
