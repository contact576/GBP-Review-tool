"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Chip, Badge, EmptyState } from "@/components/ds/misc";
import { Field, Select } from "@/components/ds/form";
import { Tabs, type TabItem } from "@/components/ds/Tabs";
import { Table, type Column, type SortDirection } from "@/components/ds/Table";
import { Drawer } from "@/components/ds/Drawer";
import { useToast } from "@/components/ds/Toast";
import { Icon, type IconName } from "@/components/icons";
import { Funnel } from "@/components/charts";
import { funnelCounts } from "@/lib/data/selectors";
import { canSendService } from "@/lib/compliance/consent";
import { formatRelative, initials, pluralize } from "@/lib/utils/format";
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

/** Dense-row rating stars render in INK, never the gold star hue. */
function InkStars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name={n <= rating ? "star-fill" : "star"}
          size={13}
          className={n <= rating ? "text-ink" : "text-hairline"}
        />
      ))}
    </span>
  );
}

/** Copy-to-clipboard request-link snippet pill — green wash, mono, never black. */
function CopyLinkPill({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy review link"
      className="flex w-full items-center gap-2 rounded-chip border border-primary/20 bg-primary-wash px-3 py-2 text-left transition-colors hover:border-primary/40"
    >
      <Icon name="google" size={15} className="shrink-0 text-primary-dark" />
      <span className="data-chip min-w-0 flex-1 truncate text-primary-dark">{url}</span>
      <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-primary-dark">
        <Icon name={copied ? "check" : "copy"} size={14} />
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

export function RequestsView({
  requests,
  customers,
  locationId,
  reviewUrl,
}: {
  requests: ReviewRequest[];
  customers: Customer[];
  locationId: string;
  reviewUrl: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [tab, setTab] = useState<TabKey>("all");
  const [sort, setSort] = useState<{ key: string; direction: SortDirection }>({
    key: "sent",
    direction: "desc",
  });
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

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sort.direction === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sort.key === "customer") return a.customerName.localeCompare(b.customerName) * dir;
      const av = a.sentAt ? new Date(a.sentAt).getTime() : 0;
      const bv = b.sentAt ? new Date(b.sentAt).getTime() : 0;
      return (av - bv) * dir;
    });
    return arr;
  }, [filtered, sort]);

  // Customers who have never had a request and aren't suppressed.
  const requestable = useMemo(() => {
    const asked = new Set(requests.map((r) => r.customerId));
    return customers.filter((c) => !asked.has(c.id) && !c.suppressedReason);
  }, [requests, customers]);

  function send() {
    if (!pickedCustomer) return;
    const cust = customerById.get(pickedCustomer);
    start(async () => {
      const result = await sendRequestAction({ locationId, customerId: pickedCustomer, channel });
      toast(
        result.status === "sent"
          ? `Request accepted for delivery to ${cust?.name ?? "customer"}`
          : `Request saved, but delivery failed for ${cust?.name ?? "customer"}`,
        result.status === "sent" ? "success" : "warning",
        result.status === "sent" ? "send" : "alert",
      );
      setDrawerOpen(false);
      setPickedCustomer("");
      router.refresh();
    });
  }

  // ── Ledger columns (desktop) ──
  const columns: Column<ReviewRequest>[] = [
    {
      key: "customer",
      header: "Customer",
      width: "260px",
      sortable: true,
      ariaLabel: "Sort by customer",
      render: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 shrink-0 place-items-center rounded-chip bg-primary-tint text-[12px] font-bold text-primary-dark">
              {initials(r.customerName)}
            </div>
            <span className="truncate font-semibold text-ink">{r.customerName}</span>
          </div>
          {r.status === "suppressed" && r.suppressedReason ? (
            <div className="mt-1 pl-[42px] text-[12px] text-faint">Suppressed — {r.suppressedReason}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "channel",
      header: "Channel",
      width: "120px",
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 capitalize text-sub">
          <Icon name={CHANNEL_ICON[r.channel]} size={15} />
          {r.channel}
        </span>
      ),
    },
    {
      key: "consent",
      header: "Consent",
      width: "150px",
      render: (r) => {
        const cust = customerById.get(r.customerId);
        const ok = cust ? canSendService(cust) : false;
        return (
          <Badge tone={ok ? "primary" : "sub"} icon={ok ? "check" : "x"}>
            {ok ? "Service" : "No consent"}
          </Badge>
        );
      },
    },
    {
      key: "rating",
      header: "Rating",
      align: "center",
      width: "116px",
      render: (r) => (r.rating ? <InkStars rating={r.rating} /> : <span className="text-faint">—</span>),
    },
    {
      key: "sent",
      header: "Sent",
      align: "right",
      width: "110px",
      sortable: true,
      ariaLabel: "Sort by sent date",
      cellClassName: "text-sub tabular-nums whitespace-nowrap",
      render: (r) => (r.sentAt ? formatRelative(r.sentAt) : "—"),
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      width: "150px",
      render: (r) => <Badge tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</Badge>,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        {/* Sticky action rail — stacks above the ledger on mobile */}
        <aside className="space-y-4 lg:order-2 lg:sticky lg:top-6">
          <Card>
            <div className="kicker mb-2">Send a request</div>
            <Button icon="send" fullWidth onClick={() => setDrawerOpen(true)}>
              Send request
            </Button>
            <div className="mt-4">
              <div className="kicker mb-1.5">Your review link</div>
              <CopyLinkPill url={reviewUrl} />
              <p className="mt-1.5 text-[12px] text-faint">
                Share this link anywhere — it opens your Google review form.
              </p>
            </div>
            <p className="mt-3 border-t border-hairline pt-3 text-[12px] text-faint">
              <span className="font-semibold text-sub tabular-nums">{requestable.length}</span>{" "}
              {pluralize(requestable.length, "customer")} eligible to ask.
            </p>
          </Card>
        </aside>

        {/* Main column — funnel + ledger */}
        <div className="min-w-0 space-y-5 lg:order-1">
          <Card>
            <div className="mb-4">
              <h2 className="text-[18px] font-bold text-ink">Ask → posted</h2>
              <p className="mt-0.5 text-[13px] text-sub">How your requests move from sent to a posted review.</p>
            </div>
            <Funnel stages={stages} title="Ask to posted funnel" />
          </Card>

          <Tabs items={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} />

          {sorted.length ? (
            <>
              {/* Desktop hairline ledger */}
              <div className="hidden lg:block">
                <Table
                  columns={columns}
                  data={sorted}
                  rowKey={(r) => r.id}
                  sort={sort}
                  onSortChange={(key, direction) => setSort({ key, direction })}
                  stickyHeader
                  caption="Review requests — customer, channel, consent, rating, sent and status"
                />
              </div>

              {/* Mobile card list */}
              <div className="space-y-2.5 lg:hidden">
                {sorted.map((r) => {
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
                              {r.sentAt ? <span className="tabular-nums">· sent {formatRelative(r.sentAt)}</span> : <span>· not sent yet</span>}
                            </div>
                          </div>
                        </div>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <Badge tone={serviceOk ? "primary" : "sub"} icon={serviceOk ? "check" : "x"}>
                          {serviceOk ? "Service consent" : "No service consent"}
                        </Badge>
                        {r.rating ? <InkStars rating={r.rating} /> : null}
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
            </>
          ) : (
            <Card>
              <EmptyState
                icon="send"
                title="No requests here yet"
                description="Capture a customer or send a request, and it'll appear here so you can track opens and reviews."
              />
            </Card>
          )}
        </div>
      </div>

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

          <div>
            <span className="mb-1.5 block text-[14px] font-semibold text-ink">Review link</span>
            <CopyLinkPill url={reviewUrl} />
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
