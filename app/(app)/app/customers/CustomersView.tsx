"use client";

import { useMemo, useRef, useState, useTransition } from "react";
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

  function openDetail(id: string) {
    setOpenId(id);
    setDrawerTab("overview");
    setRevealContact(false);
  }

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
      const result = await sendRequestAction({ locationId, customerId: c.id, channel: c.email ? "email" : "sms" });
      toast(
        result.status === "sent"
          ? `Request accepted for delivery to ${c.name}`
          : `Request saved, but delivery failed for ${c.name}`,
        result.status === "sent" ? "success" : "warning",
        result.status === "sent" ? "send" : "alert",
      );
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
