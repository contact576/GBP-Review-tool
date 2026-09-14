import { getAgencySessionAndData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ds/Card";
import { Badge, EmptyState } from "@/components/ds/misc";
import { formatRelative } from "@/lib/utils/format";
import { ACTIVITY_LABEL } from "../../_components/activity";

/**
 * The agency's own ledger in full: every client added, invited, linked,
 * synced or removed, every rate and branding change, every report batch.
 * Read from the agency workspace's append-only audit log — the same rows the
 * overview shows the top of.
 */
export default async function AgencyActivityPage() {
  const { data } = await getAgencySessionAndData();
  const entries = data.auditLog
    .filter((entry) => entry.action.startsWith("agency."))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 300);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activity"
        sub={`Everything ${data.agency.whiteLabel.brandName} has done in this console, newest first. Append-only — entries are never edited or removed.`}
        actions={<Badge tone="sub" icon="lock">{entries.length} entries</Badge>}
      />

      <Card padded={entries.length === 0}>
        {entries.length ? (
          <ul className="divide-y divide-soft">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">{ACTIVITY_LABEL[entry.action] ?? entry.action}</span>
                    <code className="rounded-chip bg-primary-wash px-1.5 py-0.5 text-[11px] font-semibold text-primary-dark">{entry.action}</code>
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-sub">
                    {entry.actor}
                    {typeof entry.meta?.name === "string" ? ` · ${entry.meta.name}` : ""}
                    {typeof entry.meta?.contactEmail === "string" ? ` · ${entry.meta.contactEmail}` : ""}
                    {typeof entry.meta?.synced === "number" ? ` · ${entry.meta.synced} synced` : ""}
                    {typeof entry.meta?.sent === "number" ? ` · ${entry.meta.sent} sent` : ""}
                    {typeof entry.meta?.count === "number" ? ` · ${entry.meta.count} clients` : ""}
                    {" · "}
                    <span className="capitalize">{entry.targetType}</span> <span className="text-faint">{entry.targetId}</span>
                  </div>
                </div>
                <span className="shrink-0 text-[12px] tabular-nums text-faint" title={entry.at}>{formatRelative(entry.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="clock"
            title="Nothing recorded yet"
            description="Adding, inviting, linking, syncing or removing a client, saving rates or branding, and sending reports are all written here."
          />
        )}
      </Card>
    </div>
  );
}
