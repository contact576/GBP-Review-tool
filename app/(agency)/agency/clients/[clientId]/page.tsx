import { notFound } from "next/navigation";
import { getAgencyClients, getAgencySessionAndData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { ScoreDial } from "@/components/charts/ScoreDial";
import { StatTile } from "@/components/charts/StatTile";
import { Sparkline } from "@/components/charts/Sparkline";
import { readableText } from "@/lib/theme/contrast";
import { formatRelative } from "@/lib/utils/format";
import { StatusBadge } from "../../../_components/StatusBadge";
import { ClientActions } from "./ClientActions";
import { ClientAccessPanel, ClientDangerZone, ClientGooglePanel } from "./ClientManagePanels";

export default async function AgencyClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const [{ data, session }, clients] = await Promise.all([getAgencySessionAndData(), getAgencyClients()]);
  const wl = data.agency.whiteLabel;
  const client = clients.find((c) => c.locationId === clientId);
  if (!client) notFound();
  const live = !session.isDemo;
  // A book entry whose workspace is gone (or was never a sibling) has no live
  // fields; management panels then only offer removal.
  const orphan = live && !client.workspaceId;

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
            <div className="text-[12px] opacity-80">Acting as {wl.brandName} · {client.city || "City not set"}</div>
          </div>
        </div>
        <StatusBadge status={client.status} />
      </div>

      {orphan ? (
        <div className="flex items-start gap-2 rounded-card border border-gold/30 bg-gold-tint p-4 text-[13px] text-gold-deep">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          This client&rsquo;s workspace can no longer be read — it was deleted or moved out of your organization. The
          figures below are the last ones stored in your book. Remove the entry to tidy the book.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="flex flex-col items-center justify-center lg:col-span-1">
          <ScoreDial value={client.growthScore} size={180} sublabel={`${client.name.split(" ")[0]} · ${client.city || "—"}`} />
          {client.trend && client.trend.length >= 2 ? (
            <div className="mt-3 flex flex-col items-center gap-1">
              <Sparkline data={client.trend} width={140} height={32} />
              <span className="text-[11px] text-faint">Growth Score over the last {client.trend.length} syncs</span>
            </div>
          ) : (
            <span className="mt-3 text-[11px] text-faint">
              {live ? "No measured history yet — sync Google to start the trail." : "Sample data"}
            </span>
          )}
        </Card>

        <div className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Rating" value={client.rating.toFixed(1)} deltaCaption={client.reviewCount !== undefined ? `${client.reviewCount} Google reviews` : undefined} />
            <StatTile label="New reviews · 30d" value={client.newReviews30d} />
            <StatTile label="Needs reply" value={client.needsReply} />
            <div className="rounded-card border border-hairline bg-card p-4 shadow-sm">
              <div className="kicker normal-case">Plan</div>
              <div className="mt-2"><Badge tone="primary">{client.plan}</Badge></div>
            </div>
          </div>

          <Card className="mt-4">
            <CardHeader kicker="Deliverables" title="Work on this client" />
            <ClientActions
              brandName={wl.brandName}
              clientId={client.locationId}
              contactEmail={client.contactEmail}
              canOpen={!orphan}
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ClientGooglePanel
          clientId={client.locationId}
          clientName={client.name}
          city={client.city}
          linked={Boolean(client.googleLinked)}
          gbpConnected={Boolean(client.gbpConnected)}
          rating={client.rating}
          reviewCount={client.reviewCount ?? 0}
          enabled={live && !orphan}
        />
        <ClientAccessPanel
          clientId={client.locationId}
          contactEmail={client.contactEmail}
          ownerEmail={client.ownerEmail}
          ownerHasLogin={Boolean(client.ownerHasLogin)}
          invitedAt={client.invitedAt}
          brandName={wl.brandName}
          enabled={live && !orphan}
        />
      </div>

      <ClientDangerZone clientId={client.locationId} clientName={client.name} enabled={live} orphan={orphan} />
    </div>
  );
}
