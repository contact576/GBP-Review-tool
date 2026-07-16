"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Badge, EmptyState } from "@/components/ds/misc";
import { Checkbox, Field, Input } from "@/components/ds/form";
import { Tabs, type TabItem } from "@/components/ds/Tabs";
import { Drawer } from "@/components/ds/Drawer";
import { useToast } from "@/components/ds/Toast";
import { Icon, type IconName } from "@/components/icons";
import { marketingConsented } from "@/lib/data/selectors";
import {
  canSendService,
  canSendMarketing,
  consentLabels,
  makeConsentSourceText,
} from "@/lib/compliance/consent";
import { customersToCsv, downloadCsv, parseCustomersCsv } from "@/lib/utils/csv";
import { initials, maskEmail, maskPhone, formatRelative, formatDate, pluralize } from "@/lib/utils/format";
import { sendRequestAction, addCustomerAction, importCustomersAction } from "@/lib/actions";
import type { Customer, ReviewRequest, LifecycleStage, Region } from "@/lib/data/types";

type TabKey = "all" | "regulars" | "never" | "reviewed" | "suppressed";

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
}: {
  customers: Customer[];
  requests: ReviewRequest[];
  region: Region;
  locationId: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // "Add customer" drawer state
  const [addOpen, setAddOpen] = useState(false);
  const [addPending, startAdd] = useTransition();
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addService, setAddService] = useState(false);
  const [addMarketing, setAddMarketing] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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

  const openCustomer = openId ? customers.find((c) => c.id === openId) ?? null : null;
  const customerRequests = useMemo(
    () => (openCustomer ? requests.filter((r) => r.customerId === openCustomer.id) : []),
    [openCustomer, requests],
  );

  function exportAll() {
    downloadCsv("customers.csv", customersToCsv(customers));
    toast("Exported customers.csv", "success", "download");
  }

  function exportOne(c: Customer) {
    downloadCsv(`${c.name.replace(/\s+/g, "-").toLowerCase()}.csv`, customersToCsv([c]));
    toast("Record exported", "success", "download");
  }

  function sendRequest(c: Customer) {
    start(async () => {
      await sendRequestAction({ locationId, customerId: c.id, channel: c.email ? "email" : "sms" });
      toast(`Request sent to ${c.name}`, "success", "send");
      setOpenId(null);
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
    startAdd(async () => {
      await addCustomerAction({
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
      toast(`${name} added`, "success", "check-circle");
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

      {filtered.length === 0 ? (
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
          {/* Desktop table */}
          <Card padded={false} className="hidden overflow-hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[14px]">
                <thead className="border-b border-hairline bg-paper/60">
                  <tr className="text-faint">
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">Consent</th>
                    <th className="px-4 py-3 font-semibold">Visits</th>
                    <th className="px-4 py-3 font-semibold">Lifecycle</th>
                    <th className="px-4 py-3 font-semibold">Last asked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filtered.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setOpenId(c.id)}
                      className="cursor-pointer transition-colors hover:bg-primary-wash/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="grid size-8 shrink-0 place-items-center rounded-chip bg-primary-tint text-[12px] font-bold text-primary-dark">
                            {initials(c.name)}
                          </div>
                          <span className="font-semibold text-ink">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sub">
                        {c.email ? maskEmail(c.email) : c.phone ? maskPhone(c.phone) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <ConsentChips c={c} />
                      </td>
                      <td className="px-4 py-3 text-sub tabular-nums">{c.visitCount}</td>
                      <td className="px-4 py-3">
                        <Badge tone={LIFECYCLE[c.lifecycleStage].tone}>{LIFECYCLE[c.lifecycleStage].label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sub">
                        {c.lastRequestAt ? formatRelative(c.lastRequestAt) : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile card list */}
          <div className="space-y-2.5 lg:hidden">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setOpenId(c.id)}
                className="w-full rounded-card border border-hairline bg-card p-4 text-left transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="grid size-9 shrink-0 place-items-center rounded-chip bg-primary-tint text-[13px] font-bold text-primary-dark">
                      {initials(c.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold text-ink">{c.name}</div>
                      <div className="text-[13px] text-faint">
                        {c.email ? maskEmail(c.email) : c.phone ? maskPhone(c.phone) : "No contact"}
                      </div>
                    </div>
                  </div>
                  <Badge tone={LIFECYCLE[c.lifecycleStage].tone}>{LIFECYCLE[c.lifecycleStage].label}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <ConsentChips c={c} />
                  <span className="text-[12px] text-faint">
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
                    <tr className="text-faint">
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold">Email</th>
                      <th className="px-3 py-2 font-semibold">Phone</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {importRows.slice(0, 8).map((r, i) => (
                      <tr key={`${r.name}-${i}`}>
                        <td className="px-3 py-2 font-semibold text-ink">{r.name}</td>
                        <td className="px-3 py-2 text-sub">{r.email ?? "—"}</td>
                        <td className="px-3 py-2 text-sub">{r.phone ?? "—"}</td>
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
        onClose={() => setAddOpen(false)}
        title="Add customer"
        footer={
          <Button onClick={addCustomer} loading={addPending} icon="plus" fullWidth>
            Add customer
          </Button>
        }
      >
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

          {addError ? (
            <p className="flex items-center gap-1.5 text-[13px] text-danger" role="alert">
              <Icon name="alert" size={13} className="shrink-0" /> {addError}
            </p>
          ) : null}
        </div>
      </Drawer>

      {/* Detail drawer */}
      <Drawer
        open={openCustomer !== null}
        onClose={() => setOpenId(null)}
        title="Customer"
        wide
        footer={
          openCustomer ? (
            <div className="flex items-center gap-2">
              <Button
                onClick={() => sendRequest(openCustomer)}
                loading={pending}
                disabled={!canSendService(openCustomer)}
                icon="send"
                fullWidth
              >
                Send review request
              </Button>
              <Button variant="secondary" icon="download" onClick={() => exportOne(openCustomer)}>
                Export
              </Button>
            </div>
          ) : undefined
        }
      >
        {openCustomer ? (
          <div className="space-y-5">
            {/* Identity header */}
            <div className="flex items-center gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-card bg-primary-tint text-[16px] font-bold text-primary-dark">
                {initials(openCustomer.name)}
              </div>
              <div className="min-w-0">
                <div className="text-[17px] font-bold text-ink">{openCustomer.name}</div>
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-sub">
                  {openCustomer.email ? <span>{maskEmail(openCustomer.email)}</span> : null}
                  {openCustomer.phone ? <span>{maskPhone(openCustomer.phone)}</span> : null}
                  <Badge tone={LIFECYCLE[openCustomer.lifecycleStage].tone}>
                    {LIFECYCLE[openCustomer.lifecycleStage].label}
                  </Badge>
                </div>
              </div>
            </div>

            {openCustomer.suppressedReason ? (
              <div className="flex items-start gap-2 rounded-btn border border-danger/30 bg-danger-tint/50 px-3 py-2">
                <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-danger" />
                <p className="text-[13px] text-sub">
                  Suppressed — <span className="font-medium text-ink">{openCustomer.suppressedReason}</span>
                </p>
              </div>
            ) : null}

            {/* Consent panel */}
            <div>
              <div className="mb-2 text-[13px] font-bold text-sub">Consent</div>
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
            </div>

            {/* Timeline */}
            <div>
              <div className="mb-2 text-[13px] font-bold text-sub">History</div>
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
            </div>

            {!canSendService(openCustomer) ? (
              <div className="flex items-start gap-2 rounded-btn border border-gold/40 bg-gold-tint/50 px-3 py-2">
                <Icon name="lock" size={16} className="mt-0.5 shrink-0 text-gold-deep" />
                <p className="text-[13px] text-sub">
                  Sending is locked — this customer hasn&apos;t consented to service messages.
                </p>
              </div>
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
        {at ? <span>· {formatDate(at)}</span> : null}
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
        <div className="text-[11px] text-faint">{formatRelative(at)}</div>
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
