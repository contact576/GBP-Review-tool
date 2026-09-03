import Link from "next/link";
import { getData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge, EmptyState } from "@/components/ds/misc";
import { LinkButton } from "@/components/ds/Button";
import { PageHeader } from "@/components/app/PageHeader";
import { SyncGoogleButton } from "@/components/app/SyncGoogleButton";
import { Icon, type IconName } from "@/components/icons";
import { ScoreDial } from "@/components/charts/ScoreDial";
import { StatTile } from "@/components/charts/StatTile";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { formatDate, formatRelative, pluralize } from "@/lib/utils/format";
import type { LocalGrowthAudit, LocalGrowthAuditFinding } from "@/lib/data/types";
import {
  buildProfileAuditView,
  isBusinessProfileAccessBlocker,
  COVERAGE_MEANING,
  IMPACT_LABELS,
  SOURCE_LABELS,
  type FindingRowModel,
} from "./audit-view";

type Coverage = LocalGrowthAudit["sourceCoverage"][keyof LocalGrowthAudit["sourceCoverage"]];

const SEVERITY_TONE: Record<LocalGrowthAuditFinding["severity"], "danger" | "gold" | "neutral"> = {
  critical: "danger",
  high: "danger",
  medium: "gold",
  low: "neutral",
};

const IMPACT_ICON: Record<LocalGrowthAuditFinding["expectedImpact"], IconName> = {
  profile: "building",
  discovery: "search",
  conversion: "phone",
  trust: "shield",
};

const COVERAGE_TONE: Record<Coverage, "primary" | "gold" | "neutral" | "danger"> = {
  connected: "primary",
  partial: "gold",
  not_connected: "neutral",
  unavailable: "neutral",
  error: "danger",
};

const COVERAGE_LABEL: Record<Coverage, string> = {
  connected: "Connected",
  partial: "Partial",
  not_connected: "Not connected",
  unavailable: "Unavailable",
  error: "Read failed",
};

export default async function ProfileAuditPage() {
  const data = await getData();
  const audit = data.location.gbpAudit;

  // Never synced — a guided start, not a blank page.
  if (!audit) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Your Google profile"
          sub="Everything Google shows about you, checked field by field — and an honest list of what we cannot see yet."
        />
        <Card>
          <EmptyState
            icon="google"
            title="We haven't read your Google profile yet"
            description="Connect Google and run a sync. Foundly will then list exactly what's missing, what needs updating, and what it still cannot check."
            action={
              <div className="flex flex-col items-center gap-3">
                <SyncGoogleButton label="Sync from Google" size="md" />
                <LinkButton href="/app/settings/integrations" variant="secondary" size="md" icon="external">
                  Connect Google
                </LinkButton>
              </div>
            }
          />
        </Card>
      </div>
    );
  }

  const view = buildProfileAuditView({
    audit,
    snapshot: data.location.gbpSnapshot,
    suggestions: data.location.suggestionInbox ?? [],
  });
  const usingPlaces = view.source === "public_places";
  const coverageEntries = Object.entries(audit.sourceCoverage) as Array<
    [keyof LocalGrowthAudit["sourceCoverage"], Coverage]
  >;
  const connectedCount = coverageEntries.filter(([, status]) => status === "connected").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Your Google profile"
        sub="Everything Google shows about you, checked field by field — and an honest list of what we cannot see yet."
        actions={<SyncGoogleButton label="Sync from Google" size="md" />}
      />

      {/* Score + the three counts this page is organised around. */}
      <Card raised>
        <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center">
          <div className="shrink-0">
            <ScoreDial
              value={audit.applicableProfileScore}
              size={172}
              label="Profile score"
              sublabel="Scored only on what we can see"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile label="Missing" value={view.missing.length} />
              <StatTile label="Needs updating" value={view.stale.length} />
              <StatTile label="Can't check yet" value={view.blocked.length} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-sub">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="clock" size={14} className="text-faint" />
                Last read {formatRelative(view.observedAt)} · {formatDate(view.observedAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="google" size={14} className="text-faint" />
                {connectedCount} of {coverageEntries.length} data sources connected
              </span>
            </div>
          </div>
        </div>

        {/* The honesty line. Never let the score read as a clean bill of health. */}
        <div
          className={`mt-5 flex items-start gap-2.5 rounded-btn border px-3 py-2.5 ${
            usingPlaces ? "border-gold/40 bg-gold-tint/40" : "border-primary/20 bg-primary-wash"
          }`}
        >
          <Icon
            name={usingPlaces ? "alert" : "shield"}
            size={16}
            className={`mt-0.5 shrink-0 ${usingPlaces ? "text-gold-deep" : "text-primary-dark"}`}
          />
          <p className={`text-[13px] leading-relaxed ${usingPlaces ? "text-gold-deep" : "text-sub"}`}>
            {usingPlaces ? (
              <>
                <span className="font-bold">Reading public Google data only.</span> Google has not
                approved Business Profile API access for this app yet, so fields that live behind
                that API — your service list, posts, Q&amp;A, review replies and holiday hours — are
                listed under &ldquo;Can&rsquo;t check yet&rdquo; below. They are never counted as
                passing, and the score above is calculated only over the checks public data can
                actually see.
              </>
            ) : (
              <>
                <span className="font-bold">Reading your connected Google Business Profile.</span>{" "}
                The score above covers only the capabilities Google says apply to this location —
                anything Google could not return is listed under &ldquo;Can&rsquo;t check yet&rdquo;
                rather than assumed fine.
              </>
            )}
          </p>
        </div>
      </Card>

      {/* 1 — Missing entirely */}
      <Card as="section">
        <CardHeader
          kicker="Absent from your profile"
          title="Missing"
          action={
            <Badge tone={view.missing.length ? "danger" : "primary"} icon={view.missing.length ? "alert" : "check-circle"}>
              {view.missing.length} {pluralize(view.missing.length, "item")}
            </Badge>
          }
        />
        {view.missing.length ? (
          <ul className="space-y-3">
            {view.missing.map((row) => (
              <FindingRow key={row.finding.id} row={row} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="check-circle"
            title="Nothing we can see is missing"
            description="Every field this sync could read has a value. That is not the same as a complete profile — check what we cannot see yet, below."
          />
        )}
      </Card>

      {/* 2 — Present but wrong, thin, stale or contradicted */}
      <Card as="section">
        <CardHeader
          kicker="There, but not right yet"
          title="Needs updating"
          action={
            <Badge tone={view.stale.length ? "gold" : "primary"} icon={view.stale.length ? "pencil" : "check-circle"}>
              {view.stale.length} {pluralize(view.stale.length, "item")}
            </Badge>
          }
        />
        {view.stale.length ? (
          <ul className="space-y-3">
            {view.stale.map((row) => (
              <FindingRow key={row.finding.id} row={row} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="check"
            title="Nothing flagged for an update"
            description="No readable field looked incomplete or stale, and no source contradicted Google on this sync."
          />
        )}

        {/* Conflicts that never became findings still deserve to be seen. */}
        <UnlistedConflicts audit={audit} rows={view.stale} />
      </Card>

      {/* 3 — Honestly unknown */}
      <Card as="section">
        <CardHeader
          kicker="Not visible to us yet"
          title="Can't check yet"
          action={<Badge tone="neutral" icon="eye">{view.blocked.length} {pluralize(view.blocked.length, "check")}</Badge>}
        />
        <p className="-mt-2 mb-4 max-w-[70ch] text-[13px] text-sub">
          These are not passes and not failures. Foundly could not read them, so it will not claim
          either way.
        </p>
        {view.blocked.length ? (
          <ul className="space-y-3">
            {view.blocked.map((row) => (
              <BlockedRow key={row.finding.id} row={row} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="eye"
            title="Every applicable check was readable"
            description="Nothing was skipped for missing access on this sync."
          />
        )}
      </Card>

      {/* 4 — Provenance */}
      <Card as="section">
        <CardHeader
          kicker="Provenance"
          title="Where this data comes from"
          action={
            <Link
              href="/app/settings/integrations"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-btn px-2 text-[13px] font-semibold text-primary hover:text-primary-dark"
            >
              Manage connections
              <Icon name="chevron-right" size={14} />
            </Link>
          }
        />
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {coverageEntries.map(([key, status]) => (
            <li
              key={key}
              className="flex items-start justify-between gap-3 rounded-btn border border-hairline bg-paper px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink">{SOURCE_LABELS[key]}</div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-sub">{COVERAGE_MEANING[status]}</p>
              </div>
              <Badge tone={COVERAGE_TONE[status]} className="shrink-0">
                {COVERAGE_LABEL[status]}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-faint">
          Connecting a source does not change your Google profile — it only lets Foundly check more
          of it.
        </p>
      </Card>

      {/* Approval lives on This Week; this page only reports. */}
      <div className="flex flex-col items-start gap-3 rounded-card border border-hairline bg-primary-wash/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-btn bg-primary text-white">
            <Icon name="shield" size={18} />
          </div>
          <p className="max-w-[65ch] text-[14px] text-ink">
            <span className="font-bold">Nothing on this page publishes anything.</span>{" "}
            {MICROCOPY.nameStuffBlocked}
          </p>
        </div>
        <LinkButton href="/app/this-week" variant="secondary" size="md" iconRight="arrow-right">
          Review &amp; approve changes
        </LinkButton>
      </div>
    </div>
  );
}

/** One open finding: what it is, why it matters, and what to do next. */
function FindingRow({ row }: { row: FindingRowModel }) {
  const { finding, suggestion, conflictExplanation } = row;
  // Only ever show a box for a value the audit actually holds — an absent
  // suggestion must not render as "nothing published".
  const showCurrent = finding.currentValue !== undefined;
  const showSuggested = finding.suggestedValue !== undefined;
  return (
    <li className="rounded-card border border-hairline bg-paper p-3.5 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-btn bg-primary-tint text-primary-dark">
          <Icon name={conflictExplanation ? "alert" : IMPACT_ICON[finding.expectedImpact]} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold leading-snug text-ink">{finding.title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-sub">
            {conflictExplanation ?? finding.rationale}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={SEVERITY_TONE[finding.severity]}>{finding.severity} severity</Badge>
            <Badge tone="neutral" icon={IMPACT_ICON[finding.expectedImpact]}>
              {IMPACT_LABELS[finding.expectedImpact]}
            </Badge>
            {conflictExplanation ? <Badge tone="gold" icon="alert">Sources disagree</Badge> : null}
            {finding.requiresOwnerFacts ? (
              <Badge tone="neutral" icon="lock">Needs your confirmation</Badge>
            ) : null}
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-bold tabular-nums text-faint">
          Priority {finding.priorityScore}
        </span>
      </div>

      {showCurrent || showSuggested ? (
        <div
          className={`mt-3 grid items-stretch gap-2 ${
            showCurrent && showSuggested ? "sm:grid-cols-[1fr_auto_1fr]" : ""
          }`}
        >
          {showCurrent ? <ValueBox label="On Google now" value={finding.currentValue} /> : null}
          {showCurrent && showSuggested ? (
            <div className="hidden items-center justify-center text-faint sm:flex">
              <Icon name="arrow-right" size={16} />
            </div>
          ) : null}
          {showSuggested ? (
            <ValueBox label="What it should become" value={finding.suggestedValue} recommended />
          ) : null}
        </div>
      ) : null}

      {suggestion ? <NextStep step={suggestion.nextStep} /> : null}
    </li>
  );
}

/** A check Foundly could not run, with the reason stated in the owner's terms. */
function BlockedRow({ row }: { row: FindingRowModel }) {
  const { finding, suggestion } = row;
  return (
    <li className="rounded-card border border-hairline bg-paper p-3.5 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-btn bg-hairline/60 text-sub">
          <Icon name="eye" size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold leading-snug text-ink">{finding.title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-sub">{finding.rationale}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral" icon="eye">Unknown — not a pass</Badge>
            <Badge tone="neutral" icon={IMPACT_ICON[finding.expectedImpact]}>
              {IMPACT_LABELS[finding.expectedImpact]}
            </Badge>
          </div>
          {finding.blockers.length ? (
            <ul className="mt-3 space-y-1.5">
              {finding.blockers.map((blocker) => (
                <li key={blocker} className="flex items-start gap-2 text-[12px] leading-relaxed text-sub">
                  <Icon name="lock" size={13} className="mt-0.5 shrink-0 text-faint" />
                  <span>
                    {blocker}
                    {isBusinessProfileAccessBlocker(blocker) ? (
                      <span className="ml-1 text-faint">
                        Google has not approved Business Profile API access for this app yet — this
                        check turns on by itself the moment it does.
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      {suggestion ? <NextStep step={suggestion.nextStep} /> : null}
    </li>
  );
}

/** The inbox's own next step, surfaced here; approval still happens on This Week. */
function NextStep({ step }: { step: string }) {
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-btn border border-primary/20 bg-primary-wash px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-[12px] leading-relaxed text-sub">
        <Icon name="arrow-right" size={14} className="mt-0.5 shrink-0 text-primary-dark" />
        <span>
          <span className="font-bold text-primary-dark">Next step: </span>
          {step}
        </span>
      </p>
      <Link
        href="/app/this-week"
        className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-btn px-2 text-[12px] font-bold text-primary hover:text-primary-dark"
      >
        Open in This Week
        <Icon name="chevron-right" size={13} />
      </Link>
    </div>
  );
}

/** Conflicts the audit recorded without emitting a finding for them. */
function UnlistedConflicts({ audit, rows }: { audit: LocalGrowthAudit; rows: FindingRowModel[] }) {
  const shown = new Set(rows.map((row) => row.finding.id));
  const extra = audit.conflicts.filter((conflict) => !shown.has(`finding_${conflict.id}`));
  if (!extra.length) return null;
  return (
    <ul className="mt-3 space-y-2">
      {extra.map((conflict) => (
        <li
          key={conflict.id}
          className="flex items-start gap-2.5 rounded-btn border border-gold/40 bg-gold-tint/40 px-3 py-2.5"
        >
          <Icon name="alert" size={15} className="mt-0.5 shrink-0 text-gold-deep" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink">
              Sources disagree on {humanField(conflict.field).toLowerCase()}
            </div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-sub">{conflict.explanation}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ValueBox({
  label,
  value,
  recommended = false,
}: {
  label: string;
  value: unknown;
  recommended?: boolean;
}) {
  const text = describeValue(value);
  return (
    <div
      className={`min-w-0 rounded-btn border px-3 py-2.5 ${
        recommended ? "border-primary/25 bg-primary-wash" : "border-hairline bg-card"
      }`}
    >
      <span className={`kicker ${recommended ? "text-primary-dark" : "text-faint"}`}>{label}</span>
      <p className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed text-sub">
        {text}
      </p>
    </div>
  );
}

/** Render an audit value for a human without ever inventing one. */
function describeValue(value: unknown): string {
  if (value === undefined || value === null) return "Nothing published";
  if (typeof value === "string") return value.trim() === "" ? "Nothing published" : value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (!value.length) return "Nothing published";
    return value.map((item) => describeValue(item)).join(", ");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    // The engine encodes recommended work as { action: "draft_local_post…" }.
    if (typeof record.action === "string" && Object.keys(record).length <= 2) {
      return humanField(record.action);
    }
    const parts = Object.entries(record)
      .filter(([, entry]) => entry !== undefined && entry !== null)
      .map(([key, entry]) => `${humanField(key)}: ${describeValue(entry)}`);
    return parts.length ? parts.join(" · ") : "Nothing published";
  }
  return String(value);
}

function humanField(field: string): string {
  const words = field
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
