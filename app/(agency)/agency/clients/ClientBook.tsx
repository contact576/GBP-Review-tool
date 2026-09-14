"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Checkbox, Input, Select } from "@/components/ds/form";
import { Table, type Column, type SortDirection } from "@/components/ds/Table";
import { Sparkline } from "@/components/charts/Sparkline";
import { useToast } from "@/components/ds/Toast";
import { formatRelative } from "@/lib/utils/format";
import { sendAgencyReportsAction, syncAllAgencyClientsAction } from "@/lib/actions";
import type { AgencyClient } from "@/lib/data/types";
import { StatusBadge, statusRank } from "../../_components/StatusBadge";
import { clientGrowth, clientLinked, isReportOverdue } from "../../_components/portfolio";

type SortKey =
  | "name"
  | "city"
  | "growthScore"
  | "rating"
  | "reviewCount"
  | "newReviews30d"
  | "needsReply"
  | "status"
  | "lastReportSent";

type Filter = "all" | "attention" | "unlinked" | "overdue" | "no_login";

const FILTER_LABEL: Record<Filter, string> = {
  all: "All clients",
  attention: "Needs a look",
  unlinked: "No Google listing",
  overdue: "Report overdue",
  no_login: "Client cannot sign in",
};

function sortValue(c: AgencyClient, key: SortKey): number | string {
  if (key === "status") return statusRank[c.status];
  if (key === "lastReportSent") return c.lastReportSent ? new Date(c.lastReportSent).getTime() : 0;
  if (key === "reviewCount") return c.reviewCount ?? 0;
  const v = c[key];
  return typeof v === "number" ? v : String(v).toLowerCase();
}

/** Band the growth score to a token colour — the number carries the meaning, the ring is a supplement. */
function scoreBand(score: number): string {
  if (score >= 75) return "text-primary";
  if (score >= 50) return "text-gold-deep";
  return "text-danger";
}

function csvEscape(value: string | number | undefined | null): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The book as a CSV the agency can drop into its own reporting. Real figures only. */
export function bookToCsv(clients: AgencyClient[], plans: Record<string, string>): string {
  const header = [
    "Client", "City", "Plan", "Status", "Google listing", "Business Profile", "Client login",
    "Growth score", "Rating", "Reviews", "New reviews (30d)", "Needs reply", "Contact email", "Last report", "Last review",
  ];
  const rows = clients.map((c) => [
    c.name, c.city, plans[c.plan] ?? c.plan, c.status.replace("_", " "),
    clientLinked(c) ? "linked" : "not linked", c.gbpConnected ? "connected" : "not connected", c.ownerHasLogin ? "yes" : "no",
    clientGrowth(c) ?? "not measured", clientLinked(c) ? c.rating.toFixed(1) : "", c.reviewCount ?? "",
    c.newReviews30d, c.needsReply, c.contactEmail ?? "", c.lastReportSent ?? "never", c.lastReviewAt ?? "",
  ]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function ClientBook({
  clients,
  plans,
  live,
  deliveryConnected,
  brandName,
}: {
  clients: AgencyClient[];
  plans: Record<string, string>;
  live: boolean;
  deliveryConnected: boolean;
  brandName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "status",
    direction: "asc",
  });
  const [syncing, startSync] = useTransition();
  const [sending, startSend] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = clients.filter((c) => {
      if (q && !(c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q) || (c.contactEmail ?? "").toLowerCase().includes(q))) return false;
      switch (filter) {
        case "attention": return c.status !== "healthy";
        case "unlinked": return !clientLinked(c);
        case "overdue": return isReportOverdue(c, now);
        case "no_login": return !c.ownerHasLogin;
        default: return true;
      }
    });
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [clients, query, filter, sort, now]);

  const allVisibleSelected = rows.length > 0 && rows.every((c) => selected.has(c.locationId));

  function toggle(locationId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(locationId);
      else next.delete(locationId);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((c) => c.locationId)) : new Set());
  }

  function exportCsv() {
    const csv = bookToCsv(rows, plans);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${brandName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-client-book-${now.toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} client${rows.length === 1 ? "" : "s"}`, "success", "download");
  }

  function syncAll() {
    setNote(null);
    startSync(async () => {
      const result = await syncAllAgencyClientsAction();
      setNote(result.message);
      toast(result.ok ? "Clients synced" : "Sync finished with problems", result.ok ? "success" : "warning", result.ok ? "refresh" : "alert");
      router.refresh();
    });
  }

  function sendSelected() {
    setNote(null);
    startSend(async () => {
      const result = await sendAgencyReportsAction([...selected]);
      setNote(result.message);
      toast(result.ok ? "Reports sent" : "Reports not sent", result.ok ? "success" : "warning", result.ok ? "send" : "alert");
      if (result.ok) setSelected(new Set());
      router.refresh();
    });
  }

  const columns: Column<AgencyClient>[] = [
    {
      key: "select",
      header: (
        <Checkbox
          checked={allVisibleSelected}
          onChange={toggleAll}
          label={<span className="sr-only">Select every visible client</span>}
        />
      ),
      ariaLabel: "Select",
      width: "44px",
      render: (c) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selected.has(c.locationId)}
            onChange={(checked) => toggle(c.locationId, checked)}
            label={<span className="sr-only">Select {c.name}</span>}
          />
        </span>
      ),
    },
    {
      key: "name",
      header: "Client",
      sortable: true,
      ariaLabel: "Sort by client",
      render: (c) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <Link
              href={`/agency/clients/${c.locationId}`}
              onClick={(e) => e.stopPropagation()}
              className="truncate text-[14px] font-semibold text-ink hover:underline focus-visible:outline-none focus-visible:underline"
            >
              {c.name}
            </Link>
            {/* Measured Growth Scores only — no trail is drawn until there are two real points. */}
            {c.trend && c.trend.length >= 2 ? (
              <span className="hidden sm:block" title={`Growth Score over the last ${c.trend.length} syncs`}>
                <Sparkline data={c.trend} width={56} height={20} />
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-faint">
            <span>{plans[c.plan] ?? c.plan}</span>
            {c.contactEmail ? <span className="truncate">· {c.contactEmail}</span> : <span className="text-gold-deep">· no contact email</span>}
          </div>
        </div>
      ),
    },
    {
      key: "city",
      header: "City",
      sortable: true,
      ariaLabel: "Sort by city",
      render: (c) => <span className="text-[13px] text-sub">{c.city || "—"}</span>,
    },
    {
      key: "google",
      header: "Google",
      ariaLabel: "Google listing and profile",
      render: (c) => (
        <span className="inline-flex flex-wrap gap-1">
          {clientLinked(c) ? (
            <Badge tone="primary" icon="check-circle">Linked</Badge>
          ) : (
            <Badge tone="gold" icon="alert">Not linked</Badge>
          )}
          {c.gbpConnected ? <Badge tone="primary" icon="google">Profile</Badge> : null}
        </span>
      ),
    },
    {
      key: "growthScore",
      header: "Growth",
      numeric: true,
      sortable: true,
      ariaLabel: "Sort by growth score",
      render: (c) =>
        clientGrowth(c) !== null ? (
          <span className={cn("font-bold", scoreBand(c.growthScore))}>{c.growthScore}</span>
        ) : (
          <span className="text-[12px] text-faint" title="Measured after the first Google sync">—</span>
        ),
    },
    {
      key: "rating",
      header: "Rating",
      numeric: true,
      sortable: true,
      ariaLabel: "Sort by rating",
      render: (c) =>
        clientLinked(c) ? (
          <span className="inline-flex items-center justify-end gap-1 text-ink">
            <Icon name="star-fill" size={12} className="text-faint" aria-hidden />
            {c.rating.toFixed(1)}
          </span>
        ) : (
          <span className="text-[12px] text-faint">—</span>
        ),
    },
    {
      key: "reviewCount",
      header: "Reviews",
      numeric: true,
      sortable: true,
      ariaLabel: "Sort by review count",
      render: (c) => <span className="text-sub">{clientLinked(c) ? c.reviewCount ?? "—" : "—"}</span>,
    },
    {
      key: "newReviews30d",
      header: "New · 30d",
      numeric: true,
      sortable: true,
      ariaLabel: "Sort by new reviews",
    },
    {
      key: "needsReply",
      header: "Needs reply",
      numeric: true,
      sortable: true,
      ariaLabel: "Sort by needs reply",
      render: (c) => (
        <span className={cn(c.needsReply > 4 ? "font-semibold text-danger" : "text-sub")}>{c.needsReply}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      ariaLabel: "Sort by status",
      render: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: "login",
      header: "Login",
      ariaLabel: "Client can sign in",
      render: (c) =>
        c.ownerHasLogin ? (
          <Badge tone="primary" icon="check-circle">Yes</Badge>
        ) : c.invitedAt ? (
          <Badge tone="gold" icon="clock">Invited</Badge>
        ) : (
          <Badge tone="sub" icon="lock">No</Badge>
        ),
    },
    {
      key: "lastReportSent",
      header: "Last report",
      align: "right",
      sortable: true,
      ariaLabel: "Sort by last report",
      render: (c) => (
        <span className={cn("text-[12px] tabular-nums", isReportOverdue(c, now) ? "text-gold-deep" : "text-sub")}>
          {c.lastReportSent ? formatRelative(c.lastReportSent) : "never"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full max-w-xs sm:w-64">
            <Input
              iconLeft="search"
              placeholder="Search by client, city or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search clients"
            />
          </div>
          <div className="w-52">
            <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Filter clients">
              {(Object.keys(FILTER_LABEL) as Filter[]).map((key) => (
                <option key={key} value={key}>{FILTER_LABEL[key]}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" icon="download" onClick={exportCsv} disabled={!rows.length}>
            Export CSV
          </Button>
          <Button variant="secondary" size="sm" icon="refresh" loading={syncing} disabled={!live || sending} onClick={syncAll}>
            Sync all from Google
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="send"
            loading={sending}
            disabled={!selected.size || !deliveryConnected || syncing}
            onClick={sendSelected}
            title={!deliveryConnected ? "Connect an email sender before sending reports" : undefined}
          >
            Send report{selected.size ? ` to ${selected.size}` : "s"}
          </Button>
        </div>
      </div>

      {note ? <p role="status" className="text-[12px] font-medium text-sub">{note}</p> : null}

      <Table
        columns={columns}
        data={rows}
        rowKey={(c) => c.locationId}
        onRowClick={(c) => router.push(`/agency/clients/${c.locationId}`)}
        isRowSelected={(c) => selected.has(c.locationId)}
        sort={sort}
        onSortChange={(key, direction) => setSort({ key: key as SortKey, direction })}
        stickyHeader
        caption="Client book — every location under management"
        emptyIcon={clients.length ? "search" : "users"}
        emptyTitle={clients.length ? "No matching clients" : "No clients yet"}
        emptyDescription={
          clients.length
            ? `No clients match ${query ? `“${query}”` : FILTER_LABEL[filter].toLowerCase()}. Try a different search or filter.`
            : "Add your first client above. Each one gets an isolated workspace with its own reviews, requests and reports."
        }
      />

      <p className="text-[12px] text-faint">
        {rows.length} of {clients.length} clients · tap a column to sort · rows open the client · figures are read from each client&rsquo;s workspace on every load; a dash means not measured yet.
      </p>
    </div>
  );
}
