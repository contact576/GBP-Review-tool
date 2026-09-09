"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Card } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Badge, EmptyState } from "@/components/ds/misc";
import { Checkbox, Field, Input } from "@/components/ds/form";
import { Tabs, type TabItem } from "@/components/ds/Tabs";
import { Table, type Column, type SortDirection } from "@/components/ds/Table";
import { Drawer } from "@/components/ds/Drawer";
import { useToast } from "@/components/ds/Toast";
import { Icon, type IconName } from "@/components/icons";
import { BrandLogo, ChannelLogo } from "@/components/icons/brands";
import { marketingConsented } from "@/lib/data/selectors";
import {
  canSendService,
  canSendMarketing,
  consentLabels,
  makeConsentSourceText,
} from "@/lib/compliance/consent";
import { customersToCsv, downloadCsv, parseCustomersCsv } from "@/lib/utils/csv";
import { initials, maskEmail, maskPhone, formatRelative, formatDate, pluralize } from "@/lib/utils/format";
import { toWhatsAppNumber, whatsAppChatUrl } from "@/lib/whatsapp/link";
import { WHATSAPP_TEMPLATES, renderWhatsAppMessage } from "@/lib/whatsapp/templates";
import {
  sendRequestAction,
  addCustomerAction,
  importCustomersAction,
  prepareWhatsAppRequestsAction,
  markWhatsAppRequestSentAction,
  type WhatsAppRecipient,
} from "@/lib/actions";
import type { Customer, ReviewRequest, LifecycleStage, Region, Channel } from "@/lib/data/types";

/** Which channels can reach a customer right now, and why not when they can't. */
interface ChannelOption {
  channel: Channel;
  label: string;
  enabled: boolean;
  /** Shown under a disabled chip — the honest reason, never a greyed mystery. */
  reason?: string;
}

function channelOptions(input: {
  email?: string;
  phone?: string;
  region: Region;
  emailReady: boolean;
  smsReady: boolean;
  serviceConsent: boolean;
}): ChannelOption[] {
  const email = (input.email ?? "").trim();
  const phone = (input.phone ?? "").trim();
  const waNumber = toWhatsAppNumber(phone || undefined, input.region);
  const consentReason = input.serviceConsent ? undefined : "Needs service-message consent first.";
  return [
    {
      channel: "email",
      label: "Email",
      enabled: Boolean(email) && input.emailReady && input.serviceConsent,
      reason: consentReason ?? (!email ? "No email address." : !input.emailReady ? "Email sending isn't connected yet (Settings → Channels)." : undefined),
    },
    {
      channel: "sms",
      label: "SMS",
      enabled: Boolean(phone) && input.smsReady && input.serviceConsent,
      reason: consentReason ?? (!phone ? "No phone number." : !input.smsReady ? "SMS isn't connected yet (Settings → Channels)." : undefined),
    },
    {
      channel: "whatsapp",
      label: "WhatsApp",
      enabled: Boolean(waNumber) && input.serviceConsent,
      reason: consentReason ?? (!phone ? "No phone number." : !waNumber ? "That number isn't dialable on WhatsApp." : "Opens in your own WhatsApp — you press send."),
    },
  ];
}

/**
 * Three chips, one per channel, each honest about whether it can send.
 * WhatsApp is always described as manual: Foundly opens the chat with the
 * message typed, the owner presses send.
 */
function ChannelPicker({
  options,
  value,
  onChange,
  allowNone,
}: {
  options: ChannelOption[];
  value: Channel | null;
  onChange: (channel: Channel | null) => void;
  allowNone?: boolean;
}) {
  const selected = options.find((option) => option.channel === value);
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Send by">
        {options.map((option) => {
          const active = value === option.channel;
          return (
            <button
              key={option.channel}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!option.enabled}
              title={!option.enabled ? option.reason : undefined}
              onClick={() => onChange(active && allowNone ? null : option.channel)}
              className={cn(
                "inline-flex min-h-[40px] items-center gap-1.5 rounded-chip border px-3 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "border-primary bg-primary-tint text-primary-dark"
                  : "border-hairline bg-card text-sub hover:border-primary/40 hover:text-ink",
                !option.enabled && "cursor-not-allowed opacity-50 hover:border-hairline hover:text-sub",
              )}
            >
              {active ? <Icon name="check" size={14} /> : <ChannelLogo channel={option.channel} size={14} />}
              {option.label}
            </button>
          );
        })}
        {allowNone ? (
          <button
            type="button"
            role="radio"
            aria-checked={value === null}
            onClick={() => onChange(null)}
            className={cn(
              "inline-flex min-h-[40px] items-center gap-1.5 rounded-chip border px-3 py-2 text-[13px] font-medium transition-colors",
              value === null
                ? "border-primary bg-primary-tint text-primary-dark"
                : "border-hairline bg-card text-sub hover:border-primary/40 hover:text-ink",
            )}
          >
            {value === null ? <Icon name="check" size={14} /> : <Icon name="clock" size={14} />}
            Not now
          </button>
        ) : null}
      </div>
      {selected?.channel === "whatsapp" ? (
        <p className="mt-2 text-[12px] leading-relaxed text-sub">{selected.reason}</p>
      ) : null}
      {options.some((option) => !option.enabled) ? (
        <ul className="mt-2 space-y-0.5">
          {options
            .filter((option) => !option.enabled && option.reason)
            .map((option) => (
              <li key={option.channel} className="text-[12px] text-faint">
                <span className="font-semibold text-sub">{option.label}:</span> {option.reason}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The manual WhatsApp hand-off for one customer: open the chat with the
 * message typed, then ask the owner whether they pressed send. Nothing is
 * marked sent until they say so — the ledger never claims a message that
 * never left.
 */
function WhatsAppHandoff({
  recipient,
  business,
  onSent,
  onSkip,
}: {
  recipient: WhatsAppRecipient;
  business: string;
  onSent: () => void;
  onSkip: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const message = renderWhatsAppMessage(WHATSAPP_TEMPLATES[0]?.body ?? "{{link}}", {
    name: recipient.name,
    business,
    link: recipient.link,
  });
  return (
    <div className="space-y-3 rounded-card border border-primary/30 bg-primary-wash/60 p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-btn bg-primary text-white">
          <BrandLogo name="whatsapp" size={20} title="" />
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-ink">Send it from your WhatsApp</div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-sub">
            Opens a chat with {recipient.name} ({recipient.phoneDisplay}) with the message below typed in. Press send there,
            then confirm here.
          </p>
        </div>
      </div>
      <p className="whitespace-pre-wrap rounded-btn border border-hairline bg-card px-3 py-2.5 text-[13px] leading-relaxed text-ink">
        {message}
      </p>
      {!opened ? (
        <Button
          fullWidth
          icon="external"
          onClick={() => {
            window.open(whatsAppChatUrl(recipient.phone, message), "_blank", "noopener,noreferrer");
            setOpened(true);
          }}
        >
          Open WhatsApp chat
        </Button>
      ) : (
        <div className="space-y-2">
          <Button fullWidth icon="check-circle" onClick={onSent}>
            I pressed send
          </Button>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon="external"
              fullWidth
              onClick={() => window.open(whatsAppChatUrl(recipient.phone, message), "_blank", "noopener,noreferrer")}
            >
              Open again
            </Button>
            <Button variant="ghost" size="sm" fullWidth onClick={onSkip}>
              I didn&apos;t send it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

type TabKey = "all" | "regulars" | "never" | "reviewed" | "suppressed";
type DrawerTab = "overview" | "consent" | "activity";

const LIFECYCLE: Record<LifecycleStage, { label: string; tone: "neutral" | "primary" | "gold" | "danger" | "sub" }> = {
  new: { label: "New", tone: "sub" },
  requested: { label: "Requested", tone: "neutral" },
  opened: { label: "Opened", tone: "primary" },
  reviewed: { label: "Reviewed", tone: "gold" },
  suppressed: { label: "Suppressed", tone: "danger" },
};

const isRegular = (c: Customer) => c.tags.includes("Regular") || c.visitCount >= 3;
const neverAsked = (c: Customer) => !c.lastRequestAt && c.lifecycleStage === "new";

export function CustomersView({
  customers,
  requests,
  region,
  locationId,
  business,
  emailReady,
  smsReady,
}: {
  customers: Customer[];
  requests: ReviewRequest[];
  region: Region;
  locationId: string;
  business: string;
  /** Resolved server-side from the real adapters — never guessed in the client. */
  emailReady: boolean;
  smsReady: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  /** Channel chosen in the detail drawer; null until the owner picks one. */
  const [detailChannel, setDetailChannel] = useState<Channel | null>(null);
  /** A WhatsApp request that has been minted and is waiting for the owner to press send. */
  const [waHandoff, setWaHandoff] = useState<WhatsAppRecipient | null>(null);

  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; direction: SortDirection }>({
    key: "name",
    direction: "asc",
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("overview");
  const [revealContact, setRevealContact] = useState(false);

  // "Add customer" drawer state
  const [addOpen, setAddOpen] = useState(false);
  const [addPending, startAdd] = useTransition();
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addService, setAddService] = useState(false);
  const [addMarketing, setAddMarketing] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  /** "Send a review request now" channel, chosen while adding; null = just add. */
  const [addChannel, setAddChannel] = useState<Channel | null>(null);

  const addOptions = useMemo(
    () =>
      channelOptions({
        email: addEmail,
        phone: addPhone,
        region,
        emailReady,
        smsReady,
        serviceConsent: addService,
      }),
    [addEmail, addPhone, region, emailReady, smsReady, addService],
  );

  // A channel that stops being possible (email cleared, consent unticked) is
  // dropped rather than silently sent through anyway.
  useEffect(() => {
    if (addChannel && !addOptions.find((option) => option.channel === addChannel)?.enabled) {
      setAddChannel(null);
    }
  }, [addChannel, addOptions]);

  // "Import CSV" state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importPending, startImport] = useTransition();
  const [importRows, setImportRows] = useState<{ name: string; email?: string; phone?: string }[]>([]);
  const [importFileName, setImportFileName] = useState("");

  const labels = consentLabels(region);

  const summary = {
    total: customers.length,
    service: customers.filter(canSendService).length,
    marketing: marketingConsented(customers),
    suppressed: customers.filter((c) => c.lifecycleStage === "suppressed" || c.suppressedReason).length,
  };

  const counts = useMemo(() => {
    return {
      regulars: customers.filter(isRegular).length,
      never: customers.filter(neverAsked).length,
      reviewed: customers.filter((c) => c.lifecycleStage === "reviewed").length,
      suppressed: customers.filter((c) => c.lifecycleStage === "suppressed" || c.suppressedReason).length,
    };
  }, [customers]);

  const tabs: TabItem[] = [
    { key: "all", label: "All", count: customers.length },
    { key: "regulars", label: "Regulars", count: counts.regulars },
    { key: "never", label: "Never asked", count: counts.never },
    { key: "reviewed", label: "Reviewed", count: counts.reviewed },
    { key: "suppressed", label: "Suppressed", count: counts.suppressed },
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !(c.email ?? "").toLowerCase().includes(q)) return false;
      switch (tab) {
        case "regulars":
          return isRegular(c);
        case "never":
          return neverAsked(c);
        case "reviewed":
          return c.lifecycleStage === "reviewed";
        case "suppressed":
          return c.lifecycleStage === "suppressed" || Boolean(c.suppressedReason);
        default:
          return true;
      }
    });
  }, [customers, tab, query]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sort.direction === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sort.key) {
        case "visits":
          return (a.visitCount - b.visitCount) * dir;
        case "lastAsked": {
          const av = a.lastRequestAt ? new Date(a.lastRequestAt).getTime() : 0;
          const bv = b.lastRequestAt ? new Date(b.lastRequestAt).getTime() : 0;
          return (av - bv) * dir;
        }
        case "name":
        default:
          return a.name.localeCompare(b.name) * dir;
      }
    });
    return arr;
  }, [filtered, sort]);

  const openCustomer = openId ? customers.find((c) => c.id === openId) ?? null : null;
  const customerRequests = useMemo(
    () => (openCustomer ? requests.filter((r) => r.customerId === openCustomer.id) : []),
    [openCustomer, requests],
  );

  const detailOptions = useMemo(
    () =>
      openCustomer
        ? channelOptions({
            email: openCustomer.email,
            phone: openCustomer.phone,
            region,
            emailReady,
            smsReady,
            serviceConsent: canSendService(openCustomer),
          })
        : [],
    [openCustomer, region, emailReady, smsReady],
  );

  function openDetail(id: string) {
    setOpenId(id);
    setDrawerTab("overview");
    setRevealContact(false);
    setWaHandoff(null);
    // Default to the first channel that can actually send, so the primary
    // button is live the moment the drawer opens when anything is possible.
    const customer = customers.find((c) => c.id === id);
    const options = customer
      ? channelOptions({
          email: customer.email,
          phone: customer.phone,
          region,
          emailReady,
          smsReady,
          serviceConsent: canSendService(customer),
        })
      : [];
    setDetailChannel(options.find((option) => option.enabled)?.channel ?? null);
  }

  function closeDetail() {
    setOpenId(null);
    setWaHandoff(null);
  }

  /**
   * Mint one WhatsApp request and hand the owner the chat. The request stays
   * queued until they confirm the send in `WhatsAppHandoff`.
   */
  async function startWhatsApp(customerId: string): Promise<boolean> {
    const result = await prepareWhatsAppRequestsAction({ locationId, customerIds: [customerId] });
    const recipient = result.recipients[0];
    if (!recipient) {
      toast(result.skipped[0]?.reason ?? "This customer can't be messaged on WhatsApp right now.", "warning", "alert");
      return false;
    }
    setWaHandoff(recipient);
    return true;
  }

  function confirmWhatsAppSent() {
    if (!waHandoff) return;
    const requestId = waHandoff.requestId;
    const name = waHandoff.name;
    setWaHandoff(null);
    start(async () => {
      await markWhatsAppRequestSentAction(requestId);
      toast(`Marked as sent to ${name} on WhatsApp`, "success", "send");
      setAddOpen(false);
      setOpenId(null);
      router.refresh();
    });
  }

  function skipWhatsApp() {
    toast("Left as not sent — you can try again from Requests.", "info", "clock");
    setWaHandoff(null);
    setAddOpen(false);
    setOpenId(null);
    router.refresh();
  }

  function exportAll() {
    downloadCsv("customers.csv", customersToCsv(customers));
    toast("Exported customers.csv", "success", "download");
  }

  function exportOne(c: Customer) {
    downloadCsv(`${c.name.replace(/\s+/g, "-").toLowerCase()}.csv`, customersToCsv([c]));
    toast("Record exported", "success", "download");
  }

  function describeDelivery(status: string, name: string, channel: Channel): { text: string; tone: "success" | "warning" | "info"; icon: IconName } {
    if (status === "sent") return { text: `Request accepted for delivery to ${name} by ${channel === "sms" ? "SMS" : "email"}`, tone: "success", icon: "send" };
    if (status === "held") return { text: `Saved for ${name} — texts hold until 8 AM in their local time`, tone: "info", icon: "clock" };
    if (status === "suppressed") return { text: `Saved, but ${name} can't be messaged yet (consent or opt-out)`, tone: "warning", icon: "shield" };
    return { text: `Request saved, but delivery failed for ${name}`, tone: "warning", icon: "alert" };
  }

  function sendRequest(c: Customer, channel: Channel) {
    start(async () => {
      if (channel === "whatsapp") {
        await startWhatsApp(c.id);
        return;
      }
      const result = await sendRequestAction({ locationId, customerId: c.id, channel });
      const note = describeDelivery(result.status, c.name, channel);
      toast(note.text, note.tone, note.icon);
      closeDetail();
      router.refresh();
    });
  }

  function resetAddForm() {
    setAddName("");
    setAddEmail("");
    setAddPhone("");
    setAddService(false);
    setAddMarketing(false);
    setAddError(null);
    setAddChannel(null);
    setWaHandoff(null);
  }

  function addCustomer() {
    const name = addName.trim();
    const email = addEmail.trim();
    const phone = addPhone.trim();
    if (!name) {
      setAddError("Enter the customer's name.");
      return;
    }
    if (!email && !phone) {
      setAddError("Add an email or a phone number so you can reach them.");
      return;
    }
    const channel = addChannel;
    startAdd(async () => {
      const { id } = await addCustomerAction({
        name,
        email: email || undefined,
        phone: phone || undefined,
        services: [],
        serviceConsent: addService,
        marketingConsent: addMarketing,
        consentSourceText: addService
          ? makeConsentSourceText(region, addMarketing)
          : "Added manually — no consent captured yet.",
      });
      if (!channel) {
        toast(`${name} added`, "success", "check-circle");
        setAddOpen(false);
        resetAddForm();
        router.refresh();
        return;
      }
      if (channel === "whatsapp") {
        // The customer is saved; the drawer now becomes the WhatsApp hand-off.
        const handed = await startWhatsApp(id);
        if (!handed) {
          setAddOpen(false);
          resetAddForm();
        }
        router.refresh();
        return;
      }
      const result = await sendRequestAction({ locationId, customerId: id, channel });
      const note = describeDelivery(result.status, name, channel);
      toast(`${name} added. ${note.text}`, note.tone, note.icon);
      setAddOpen(false);
      resetAddForm();
      router.refresh();
    });
  }

  function pickImportFile() {
    fileInputRef.current?.click();
  }

  async function onImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so re-selecting the same file still fires onChange.
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const rows = parseCustomersCsv(text);
    setImportRows(rows);
    setImportFileName(file.name);
    setImportOpen(true);
    if (rows.length === 0) {
      toast("No valid rows found in that file", "warning", "alert");
    }
  }

  function confirmImport() {
    if (importRows.length === 0) return;
    startImport(async () => {
      const result = await importCustomersAction(
        importRows.map((r) => ({
          name: r.name,
          email: r.email,
          phone: r.phone,
          serviceConsent: false,
          marketingConsent: false,
          services: [],
          consentSourceText: "Imported via CSV",
        })),
      );
      toast(`Added ${result.added} (skipped ${result.skipped})`, "success", "check-circle");
      setImportOpen(false);
      setImportRows([]);
      setImportFileName("");
      router.refresh();
    });
  }

  // ── Ledger columns (desktop) ──
  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Customer",
      sortable: true,
      ariaLabel: "Sort by name",
      render: (c) => (
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-chip bg-primary-tint text-[12px] font-bold text-primary-dark">
            {initials(c.name)}
          </div>
          <span className="font-semibold text-ink">{c.name}</span>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      cellClassName: "text-sub tabular-nums",
      render: (c) => (c.email ? maskEmail(c.email) : c.phone ? maskPhone(c.phone) : "—"),
    },
    {
      key: "consent",
      header: "Consent",
      render: (c) => <ConsentChips c={c} />,
    },
    {
      key: "visits",
      header: "Visits",
      numeric: true,
      sortable: true,
      ariaLabel: "Sort by visits",
      accessor: (c) => c.visitCount,
    },
    {
      key: "lifecycle",
      header: "Lifecycle",
      render: (c) => <Badge tone={LIFECYCLE[c.lifecycleStage].tone}>{LIFECYCLE[c.lifecycleStage].label}</Badge>,
    },
    {
      key: "lastAsked",
      header: "Last asked",
      align: "right",
      sortable: true,
      ariaLabel: "Sort by last asked",
      cellClassName: "text-sub tabular-nums whitespace-nowrap",
      render: (c) => (c.lastRequestAt ? formatRelative(c.lastRequestAt) : "Never"),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryStat label="Total" value={summary.total} icon="users" />
          <SummaryStat label="Service opted-in" value={summary.service} icon="check-circle" tone="primary" />
          <SummaryStat label="Marketing opted-in" value={summary.marketing} icon="megaphone" tone="gold" />
          <SummaryStat label="Suppressed" value={summary.suppressed} icon="shield" />
        </div>
      </Card>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:max-w-xs sm:flex-1">
          <Input
            iconLeft="search"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search customers"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" icon="plus" onClick={() => setAddOpen(true)}>
            Add customer
          </Button>
          <Button variant="secondary" size="sm" icon="file" onClick={pickImportFile}>
            Import CSV
          </Button>
          <Button variant="secondary" size="sm" icon="download" onClick={exportAll}>
            Export CSV
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        aria-hidden="true"
        onChange={onImportFileChange}
      />

      <Tabs items={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} />

      {sorted.length === 0 ? (
        <Card>
          {customers.length === 0 ? (
            <EmptyState
              icon="users"
              title="No customers yet"
              description="Capture your first customer at the front desk, or import a list — then you can send review requests."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" icon="plus" onClick={() => setAddOpen(true)}>Add a customer</Button>
                  <Button size="sm" variant="secondary" icon="file" onClick={pickImportFile}>Import CSV</Button>
                </div>
              }
            />
          ) : (
            <EmptyState
              icon="search"
              title="No customers match this view"
              description="Try a different tab or clear your search."
            />
          )}
        </Card>
      ) : (
        <>
          {/* Desktop hairline ledger */}
          <div className="hidden lg:block">
            <Table
              columns={columns}
              data={sorted}
              rowKey={(c) => c.id}
              onRowClick={(c) => openDetail(c.id)}
              isRowSelected={(c) => c.id === openId}
              sort={sort}
              onSortChange={(key, direction) => setSort({ key, direction })}
              stickyHeader
              caption="Customers — name, contact, consent, visits, lifecycle and last asked"
            />
          </div>

          {/* Mobile card list */}
          <div className="space-y-2.5 lg:hidden">
            {sorted.map((c) => (
              <button
                key={c.id}
                onClick={() => openDetail(c.id)}
                className="w-full rounded-card border border-hairline bg-card p-4 text-left transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="grid size-9 shrink-0 place-items-center rounded-chip bg-primary-tint text-[13px] font-bold text-primary-dark">
                      {initials(c.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold text-ink">{c.name}</div>
                      <div className="text-[13px] text-faint tabular-nums">
                        {c.email ? maskEmail(c.email) : c.phone ? maskPhone(c.phone) : "No contact"}
                      </div>
                    </div>
                  </div>
                  <Badge tone={LIFECYCLE[c.lifecycleStage].tone}>{LIFECYCLE[c.lifecycleStage].label}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <ConsentChips c={c} />
                  <span className="text-[12px] text-faint tabular-nums">
                    {c.visitCount} {pluralize(c.visitCount, "visit")}
                    {c.lastRequestAt ? ` · asked ${formatRelative(c.lastRequestAt)}` : ""}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Import-preview drawer */}
      <Drawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import customers"
        footer={
          <Button
            onClick={confirmImport}
            loading={importPending}
            disabled={importRows.length === 0}
            icon="plus"
            fullWidth
          >
            {importRows.length > 0 ? `Import ${importRows.length} ${pluralize(importRows.length, "customer")}` : "Nothing to import"}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-card border border-hairline bg-card p-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary-dark">
              <Icon name="file" size={18} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-ink">{importFileName || "Selected file"}</div>
              <div className="text-[13px] text-sub">
                {importRows.length} valid {pluralize(importRows.length, "row")} found
              </div>
            </div>
          </div>

          {importRows.length === 0 ? (
            <div className="flex items-start gap-2 rounded-btn border border-gold/40 bg-gold-tint/50 px-3 py-2">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-gold-deep" />
              <p className="text-[13px] text-sub">
                No usable rows. Expected columns are name, email, phone — a header row is optional.
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-2 text-[13px] font-bold text-sub">Preview</div>
              <div className="overflow-hidden rounded-card border border-hairline">
                <table className="w-full text-left text-[13px]">
                  <thead className="border-b border-hairline bg-paper/60">
                    <tr className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
                      <th className="px-3 py-2 font-bold">Name</th>
                      <th className="px-3 py-2 font-bold">Email</th>
                      <th className="px-3 py-2 font-bold">Phone</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {importRows.slice(0, 8).map((r, i) => (
                      <tr key={`${r.name}-${i}`}>
                        <td className="px-3 py-2 font-semibold text-ink">{r.name}</td>
                        <td className="px-3 py-2 text-sub tabular-nums">{r.email ?? "—"}</td>
                        <td className="px-3 py-2 text-sub tabular-nums">{r.phone ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importRows.length > 8 ? (
                <p className="mt-2 text-[13px] text-faint">
                  …and {importRows.length - 8} more {pluralize(importRows.length - 8, "row")}.
                </p>
              ) : null}
              <p className="mt-3 text-[13px] text-faint">
                Imported customers start with no consent captured — you can send review requests once
                they opt in.
              </p>
            </div>
          )}
        </div>
      </Drawer>

      {/* Add-customer drawer */}
      <Drawer
        open={addOpen}
        onClose={() => {
          if (waHandoff) return; // finish or skip the WhatsApp hand-off first
          setAddOpen(false);
        }}
        title={waHandoff ? "Send on WhatsApp" : "Add customer"}
        footer={
          waHandoff ? undefined : (
            <Button
              onClick={addCustomer}
              loading={addPending}
              icon={addChannel ? "send" : "plus"}
              fullWidth
            >
              {addChannel === "email"
                ? "Add & send by email"
                : addChannel === "sms"
                  ? "Add & send by SMS"
                  : addChannel === "whatsapp"
                    ? "Add & open WhatsApp"
                    : "Add customer"}
            </Button>
          )
        }
      >
        {waHandoff ? (
          <WhatsAppHandoff recipient={waHandoff} business={business} onSent={confirmWhatsAppSent} onSkip={skipWhatsApp} />
        ) : (
        <div className="space-y-4">
          <Field label="Name" required>
            <Input
              value={addName}
              onChange={(e) => {
                setAddName(e.target.value);
                setAddError(null);
              }}
              placeholder="Customer's name"
              aria-label="Customer's name"
            />
          </Field>
          <Field label="Email" hint="Email or phone — at least one.">
            <Input
              type="email"
              inputMode="email"
              value={addEmail}
              onChange={(e) => {
                setAddEmail(e.target.value);
                setAddError(null);
              }}
              placeholder="name@example.com"
              iconLeft="mail"
            />
          </Field>
          <Field label="Phone">
            <Input
              type="tel"
              inputMode="tel"
              value={addPhone}
              onChange={(e) => {
                setAddPhone(e.target.value);
                setAddError(null);
              }}
              placeholder="(555) 010-2030"
              iconLeft="phone"
            />
          </Field>

          <div className="space-y-3 rounded-card border border-hairline bg-card p-3">
            <div className="text-[13px] font-bold text-sub">Consent</div>
            <Checkbox
              checked={addService}
              onChange={setAddService}
              label={labels.service}
              hint="Required before any review request can be sent."
            />
            <Checkbox
              checked={addMarketing}
              onChange={setAddMarketing}
              label={labels.marketing}
              hint={labels.casl}
            />
            <p className="text-[13px] text-faint">
              Check only what the customer actually agreed to — consent is recorded with today&apos;s
              date.
            </p>
          </div>

          {/* Send now — the ask goes out the moment the customer is saved. */}
          <div className="space-y-3 rounded-card border border-hairline bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13px] font-bold text-sub">Send a review request now?</div>
              {addChannel ? <Badge tone="primary" icon="send">Sends on save</Badge> : <Badge tone="sub">Optional</Badge>}
            </div>
            <ChannelPicker options={addOptions} value={addChannel} onChange={setAddChannel} allowNone />
            {!addService ? (
              <p className="flex items-start gap-1.5 text-[12px] text-faint">
                <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
                Tick the service-message consent above to unlock sending.
              </p>
            ) : null}
          </div>

          {addError ? (
            <p className="flex items-center gap-1.5 text-[13px] text-danger" role="alert">
              <Icon name="alert" size={13} className="shrink-0" /> {addError}
            </p>
          ) : null}
        </div>
        )}
      </Drawer>

      {/* Detail drawer */}
      <Drawer
        open={openCustomer !== null}
        onClose={() => {
          if (waHandoff) return; // finish or skip the WhatsApp hand-off first
          closeDetail();
        }}
        title="Customer"
        wide
        footer={
          openCustomer && !waHandoff ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 text-[12px] font-bold text-sub">Send a review request by</div>
                <ChannelPicker options={detailOptions} value={detailChannel} onChange={setDetailChannel} />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => detailChannel && sendRequest(openCustomer, detailChannel)}
                  loading={pending}
                  disabled={!detailChannel}
                  icon={detailChannel === "whatsapp" ? "chat" : "send"}
                  fullWidth
                >
                  {detailChannel === "whatsapp"
                    ? "Open WhatsApp with the request"
                    : detailChannel === "sms"
                      ? "Send by SMS"
                      : detailChannel === "email"
                        ? "Send by email"
                        : "Send review request"}
                </Button>
                <Button variant="secondary" icon="download" onClick={() => exportOne(openCustomer)}>
                  Export
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {openCustomer && waHandoff ? (
          <WhatsAppHandoff recipient={waHandoff} business={business} onSent={confirmWhatsAppSent} onSkip={skipWhatsApp} />
        ) : openCustomer ? (
          <div className="space-y-5">
            {/* Identity header */}
            <div className="flex items-start gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-card bg-primary-tint text-[16px] font-bold text-primary-dark">
                {initials(openCustomer.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-bold text-ink">{openCustomer.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone={LIFECYCLE[openCustomer.lifecycleStage].tone}>
                    {LIFECYCLE[openCustomer.lifecycleStage].label}
                  </Badge>
                  <span className="data-chip text-faint">
                    {openCustomer.visitCount} {pluralize(openCustomer.visitCount, "visit")}
                  </span>
                </div>
              </div>
              {openCustomer.email || openCustomer.phone ? (
                <button
                  type="button"
                  onClick={() => setRevealContact((v) => !v)}
                  aria-pressed={revealContact}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-btn border border-hairline bg-card px-2.5 py-1.5 text-[12px] font-semibold text-sub transition-colors hover:border-primary/30 hover:text-ink"
                >
                  <Icon name="eye" size={14} />
                  {revealContact ? "Hide" : "Reveal"}
                </button>
              ) : null}
            </div>

            {openCustomer.suppressedReason ? (
              <div className="flex items-start gap-2 rounded-btn border border-danger/30 bg-danger-tint/50 px-3 py-2">
                <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-danger" />
                <p className="text-[13px] text-sub">
                  Suppressed — <span className="font-medium text-ink">{openCustomer.suppressedReason}</span>
                </p>
              </div>
            ) : null}

            {/* Underline sub-tabs */}
            <Tabs
              variant="underline"
              items={[
                { key: "overview", label: "Overview" },
                { key: "consent", label: "Consent" },
                { key: "activity", label: "Activity" },
              ]}
              active={drawerTab}
              onChange={(k) => setDrawerTab(k as DrawerTab)}
            />

            {/* Overview — two-column key/value spec rows (masked reveal preserved) */}
            {drawerTab === "overview" ? (
              <dl className="rounded-card border border-hairline bg-card px-4">
                <SpecRow label="Email">
                  {openCustomer.email ? (
                    <span className="tabular-nums">{revealContact ? openCustomer.email : maskEmail(openCustomer.email)}</span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </SpecRow>
                <SpecRow label="Phone">
                  {openCustomer.phone ? (
                    <span className="tabular-nums">{revealContact ? openCustomer.phone : maskPhone(openCustomer.phone)}</span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </SpecRow>
                <SpecRow label="Source">
                  <span className="capitalize">{openCustomer.source.replace("_", " ")}</span>
                </SpecRow>
                <SpecRow label="Visits" numeric>
                  {openCustomer.visitCount}
                </SpecRow>
                <SpecRow label="Last visit">
                  {openCustomer.lastVisitAt ? <span className="tabular-nums">{formatDate(openCustomer.lastVisitAt)}</span> : <span className="text-faint">—</span>}
                </SpecRow>
                <SpecRow label="Last asked">
                  {openCustomer.lastRequestAt ? <span className="tabular-nums">{formatDate(openCustomer.lastRequestAt)}</span> : <span className="text-faint">Never</span>}
                </SpecRow>
                <SpecRow label="Services">
                  {openCustomer.services.length ? openCustomer.services.join(", ") : <span className="text-faint">—</span>}
                </SpecRow>
                {openCustomer.tags.length ? (
                  <SpecRow label="Tags">
                    <span className="inline-flex flex-wrap justify-end gap-1">
                      {openCustomer.tags.map((t) => (
                        <Badge key={t} tone="neutral">{t}</Badge>
                      ))}
                    </span>
                  </SpecRow>
                ) : null}
              </dl>
            ) : null}

            {/* Consent panel */}
            {drawerTab === "consent" ? (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <ConsentChips c={openCustomer} />
                </div>
                <div className="space-y-2.5">
                  <ConsentRow
                    title="Service messages"
                    given={canSendService(openCustomer)}
                    at={openCustomer.consent.serviceConsentAt}
                    source={labels.service}
                    channel={openCustomer.consent.consentChannel}
                  />
                  <ConsentRow
                    title="Marketing offers"
                    given={canSendMarketing(openCustomer)}
                    at={openCustomer.consent.marketingConsentAt}
                    source={labels.marketing}
                    channel={openCustomer.consent.consentChannel}
                    casl={openCustomer.consent.caslCaptured ? labels.casl : undefined}
                  />
                </div>
                <p className="mt-2 text-[13px] text-faint">{openCustomer.consent.consentSourceText}</p>

                {!canSendService(openCustomer) ? (
                  <div className="mt-3 flex items-start gap-2 rounded-btn border border-gold/40 bg-gold-tint/50 px-3 py-2">
                    <Icon name="lock" size={16} className="mt-0.5 shrink-0 text-gold-deep" />
                    <p className="text-[13px] text-sub">
                      Sending is locked — this customer hasn&apos;t consented to service messages.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Activity timeline — mono timestamps */}
            {drawerTab === "activity" ? (
              <ol className="space-y-3">
                <TimelineItem
                  icon="plus"
                  label="Customer added"
                  at={openCustomer.createdAt}
                  detail={`Source: ${openCustomer.source.replace("_", " ")}`}
                />
                {openCustomer.lastVisitAt ? (
                  <TimelineItem
                    icon="map-pin"
                    label={`${openCustomer.visitCount} ${pluralize(openCustomer.visitCount, "visit")} recorded`}
                    at={openCustomer.lastVisitAt}
                    detail={openCustomer.services.length ? openCustomer.services.join(", ") : undefined}
                  />
                ) : null}
                {customerRequests.map((r) => (
                  <TimelineItem
                    key={r.id}
                    icon="send"
                    label={`Review request (${r.channel})`}
                    at={r.sentAt ?? r.createdAt}
                    detail={r.status.replace("_", " ")}
                  />
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

function ConsentChips({ c }: { c: Customer }) {
  const service = canSendService(c);
  const marketing = canSendMarketing(c);
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge tone={service ? "primary" : "sub"} icon={service ? "check" : "x"}>
        Service
      </Badge>
      <Badge tone={marketing ? "gold" : "sub"} icon={marketing ? "check" : "x"}>
        Marketing
      </Badge>
    </div>
  );
}

/** Two-column key/value spec row — mono-caps label left, value right. */
function SpecRow({
  label,
  numeric,
  children,
}: {
  label: string;
  numeric?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <dt className="shrink-0 pt-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-faint">{label}</dt>
      <dd className={cn("min-w-0 break-words text-right text-[14px] text-ink", numeric && "tabular-nums")}>
        {children}
      </dd>
    </div>
  );
}

function ConsentRow({
  title,
  given,
  at,
  source,
  channel,
  casl,
}: {
  title: string;
  given: boolean;
  at?: string;
  source: string;
  channel: string;
  casl?: string;
}) {
  return (
    <div className="rounded-card border border-hairline bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-semibold text-ink">{title}</span>
        <Badge tone={given ? "primary" : "sub"} icon={given ? "check-circle" : "x"}>
          {given ? "Given" : "Not given"}
        </Badge>
      </div>
      <p className="mt-1 text-[13px] text-sub">{source}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-faint">
        <span className="capitalize">Captured {channel.replace("_", " ")}</span>
        {at ? <span className="data-chip">· {formatDate(at)}</span> : null}
        {casl ? <Badge tone="neutral" icon="shield">CASL</Badge> : null}
      </div>
      {casl ? <p className="mt-1 text-[11px] text-faint">{casl}</p> : null}
    </div>
  );
}

function TimelineItem({
  icon,
  label,
  at,
  detail,
}: {
  icon: IconName;
  label: string;
  at: string;
  detail?: string;
}) {
  return (
    <li className="flex gap-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-btn bg-primary-tint text-primary-dark">
        <Icon name={icon} size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-ink">{label}</div>
        {detail ? <div className="text-[13px] capitalize text-sub">{detail}</div> : null}
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-faint">
          <span className="data-chip">{formatDate(at)}</span>
          <span className="text-[11px]">· {formatRelative(at)}</span>
        </div>
      </div>
    </li>
  );
}

function SummaryStat({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  icon: IconName;
  tone?: "neutral" | "primary" | "gold";
}) {
  const color = tone === "primary" ? "text-primary-dark" : tone === "gold" ? "text-gold-deep" : "text-ink";
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary-dark">
        <Icon name={icon} size={18} />
      </div>
      <div>
        <div className={`text-[22px] font-extrabold tabular-nums ${color}`}>{value}</div>
        <div className="kicker">{label}</div>
      </div>
    </div>
  );
}
