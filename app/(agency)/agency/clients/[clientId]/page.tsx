import { notFound } from "next/navigation";
import { getAgencyClients, getData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { ScoreDial } from "@/components/charts/ScoreDial";
import { StatTile } from "@/components/charts/StatTile";
import { readableText } from "@/lib/theme/contrast";
import { formatRelative } from "@/lib/utils/format";
import { StatusBadge } from "../../../_components/StatusBadge";
import { ClientActions } from "./ClientActions";

export default async function AgencyClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const [data, clients] = await Promise.all([getData(), getAgencyClients()]);
  const wl = data.agency.whiteLabel;
  const client = clients.find((c) => c.locationId === clientId);
  if (!client) notFound();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <LinkButton href="/agency/clients" variant="ghost" size="sm" icon="chevron-left">Client book</LinkButton>
        <span className="text-faint">/</span>
        <span className="font-semibold text-ink">{client.name}</span>
      </div>

      {/* "Acting as" banner — the agency brand, not Foundly */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-card p-4"
        style={{ backgroundColor: wl.primary, color: readableText(wl.primary) }}
      >
        <div className="flex items-center gap-3">
          <span
            className="grid size-9 place-items-center rounded-btn text-[15px] font-black"
            style={{ backgroundColor: readableText(wl.primary), color: wl.primary }}
          >
            {wl.logoText.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <div className="text-[15px] font-bold">{client.name}</div>
            <div className="text-[12px] opacity-80">Acting as {wl.brandName} · {client.city}</div>
          </div>
        </div>
        <StatusBadge status={client.status} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="flex flex-col items-center justify-center lg:col-span-1">
          <ScoreDial value={client.growthScore} size={180} sublabel={`${client.name.split(" ")[0]} · ${client.city}`} />
        </Card>

        <div className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Rating" value={client.rating.toFixed(1)} />
            <StatTile label="New reviews · 30d" value={client.newReviews30d} />
            <StatTile label="Needs reply" value={client.needsReply} />
            <div className="rounded-card border border-hairline bg-card p-4 shadow-sm">
              <div className="kicker normal-case">Plan</div>
              <div className="mt-2"><Badge tone="primary">{client.plan}</Badge></div>
            </div>
          </div>

          <Card className="mt-4">
            <CardHeader kicker="Deliverables" title="Manage this client" />
            <ClientActions
              brandName={wl.brandName}
              clientId={client.locationId}
              contactEmail={client.contactEmail}
            />
            <div className="mt-4 flex items-center gap-2 rounded-btn bg-primary-wash p-3 text-[12px] text-sub">
              <Icon name="clock" size={16} className="shrink-0 text-primary" />
              <span>
                {client.lastReportSent
                  ? `Last branded report sent ${formatRelative(client.lastReportSent)}.`
                  : "No report sent yet — send the first branded Growth Report."}
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
