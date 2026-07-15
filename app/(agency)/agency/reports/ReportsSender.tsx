import { Card, CardHeader } from "@/components/ds/Card";
import { Button, LinkButton } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { formatRelative } from "@/lib/utils/format";
import type { AgencyClient } from "@/lib/data/types";

/**
 * Honest report roster: bulk sending waits on the email service (no fake
 * progress), while previewing the report itself is real.
 */
export function ReportsSender({ clients, brandName }: { clients: AgencyClient[]; brandName: string }) {
  const stale = clients.filter((c) => {
    if (!c.lastReportSent) return true;
    return Date.now() - new Date(c.lastReportSent).getTime() > 14 * 86_400_000;
  }).length;

  return (
    <Card>
      <CardHeader
        kicker="Deliverable"
        title="Branded Growth Report"
        action={
          <div className="flex items-center gap-2">
            <LinkButton href="/app/report" variant="secondary" size="sm" icon="file">
              Preview report
            </LinkButton>
            <span title="Sends when the email service is connected">
              <Button variant="primary" size="sm" icon="send" disabled>
                Send to all
              </Button>
            </span>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-btn bg-primary-wash p-3 text-[12px] text-sub">
        <Icon name="file" size={16} className="shrink-0 text-primary" />
        <span>
          The Growth Report is the agency deliverable — a plain-English, {brandName}-branded monthly
          recap of found-you, contacted-you and new-review activity.{" "}
          {stale > 0 ? `${stale} client${stale === 1 ? "" : "s"} are overdue.` : "All clients are current."}
        </span>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-btn border border-hairline bg-card p-3 text-[12px] text-sub">
        <Icon name="clock" size={15} className="mt-0.5 shrink-0 text-primary" />
        <span>
          <span className="font-semibold text-ink">Sending is not live yet.</span> Bulk report
          emails go out when the email service is connected — until then, preview the report and
          share it with clients directly.
        </span>
      </div>

      <ul className="divide-y divide-hairline">
        {clients.map((c) => (
          <li key={c.locationId} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-ink">{c.name}</div>
              <div className="text-[12px] text-sub">{c.city} · Growth {c.growthScore}</div>
            </div>
            {c.lastReportSent ? (
              <span className="text-[12px] text-faint">Last sent {formatRelative(c.lastReportSent)}</span>
            ) : (
              <Badge tone="sub" icon="clock">Never sent</Badge>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
