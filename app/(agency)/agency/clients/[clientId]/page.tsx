import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgencyClients, getAgencySessionAndData, getProviderFor } from "@/lib/data";
import { emailEnabledFor } from "@/lib/email";
import { Card, CardHeader } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { BrandLogo } from "@/components/icons/brands";
import { ScoreDial } from "@/components/charts/ScoreDial";
import { StatTile } from "@/components/charts/StatTile";
import { Sparkline } from "@/components/charts/Sparkline";
import { readableText } from "@/lib/theme/contrast";
import { formatDate, formatRelative } from "@/lib/utils/format";
import { PLANS, normalizePlan } from "@/lib/billing/plans";
import type { FoundlyData } from "@/lib/data/types";
import { StatusBadge } from "../../../_components/StatusBadge";
import { clientGrowth, clientLinked, isReportOverdue, monthLabel } from "../../../_components/portfolio";
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
  const linked = clientLinked(client);
  const growth = clientGrowth(client);
  // The demo book is seeded fixtures with no workspace behind them; its
  // snapshot panels say so instead of claiming a read failed.
  const unreadable = live ? "The client’s workspace could not be read." : "Sample client — live workspace details appear for real clients.";
  const agencyEmail = (session.email || data.owner.email).toLowerCase();
  const deliveryConnected = session.isDemo || (await emailEnabledFor(data.workspace.id));

  // The client's own workspace, read for the snapshot panels. Only a sibling
  // the rollup already verified can be here, so this never reaches a
  // workspace outside the agency's organization.
  let snapshot: FoundlyData | null = null;
  if (client.workspaceId) {
    const provider = await getProviderFor(session);
    snapshot = await provider.getData(client.workspaceId);
  }
  const liveReviews = (snapshot?.reviews ?? []).filter((review) => review.durability !== "vanished");
  const recentReviews = [...liveReviews].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 5);
  const realRequests = (snapshot?.requests ?? []).filter((request) => !request.isTest);
  const requestsSent = realRequests.filter((request) => request.sentAt).length;
  const requestsReviewed = realRequests.filter((request) => request.status === "posted_google").length;
  const lastSync = snapshot?.location.gbpSnapshot?.syncedAt;
  const reviewsByMonth = client.reviewsByMonth ?? [];
  const maxMonth = Math.max(1, ...reviewsByMonth.map((bucket) => bucket.count));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <LinkButton href="/agency/clients" variant="ghost" size="sm" icon="chevron-left">Clients</LinkButton>
        <span className="text-faint">/</span>
        <span className="font-semibold text-ink">{client.name}</span>
      </div>

      {/* "Acting as" banner — the agency brand, not Foundly */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-card p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
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
            <div className="text-[12px] opacity-80">
              Managed by {wl.brandName} · {client.city || "City not set"} · {PLANS[normalizePlan(client.plan)].name} plan
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={client.status} />
          {isReportOverdue(client) ? <Badge tone="gold" icon="file">Report overdue</Badge> : null}
        </div>
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
          {growth !== null ? (
            <>
              <ScoreDial value={growth} size={180} sublabel={`${client.name.split(" ")[0]} · ${client.city || "—"}`} />
              {client.trend && client.trend.length >= 2 ? (
                <div className="mt-3 flex flex-col items-center gap-1">
                  <Sparkline data={client.trend} width={140} height={32} />
                  <span className="text-[11px] text-faint">Growth Score over the last {client.trend.length} syncs</span>
                </div>
              ) : (
                <span className="mt-3 text-[11px] text-faint">{live ? "One measured score so far — the trail starts on the next sync." : "Sample data"}</span>
              )}
            </>
          ) : (
            <div className="py-6 text-center">
              <div className="kicker">Local Growth Score</div>
              <div className="display-num mt-2 text-[44px] text-faint">—</div>
              <p className="mx-auto mt-2 max-w-[220px] text-[12px] leading-relaxed text-sub">
                {live
                  ? linked
                    ? "Not measured yet — run a Google sync below and the score is computed from the listing."
                    : "Not measured — link the Google listing below, then sync."
                  : "Sample data"}
              </p>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Rating"
              value={linked ? client.rating.toFixed(1) : "—"}
              deltaCaption={linked ? (typeof client.reviewCount === "number" ? `${client.reviewCount} Google reviews` : "From the linked listing") : "No listing linked"}
            />
            <StatTile label="New reviews · 30d" value={client.newReviews30d} deltaCaption={client.lastReviewAt ? `Latest ${formatRelative(client.lastReviewAt)}` : "None detected yet"} />
            <StatTile label="Needs reply" value={client.needsReply} favorableWhenUp={false} deltaCaption="Awaiting an owner reply" />
            <StatTile
              label="Requests"
              value={snapshot ? requestsSent : "—"}
              deltaCaption={snapshot ? `${requestsReviewed} led to a detected review` : live ? "Workspace unreadable" : "Sample client"}
            />
          </div>

          <Card className="mt-4">
            <CardHeader kicker="Deliverables" title="Work on this client" />
            <ClientActions
              brandName={wl.brandName}
              clientId={client.locationId}
              contactEmail={client.contactEmail}
              canOpen={!orphan}
              deliveryConnected={deliveryConnected}
            />
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-btn bg-primary-wash/70 p-3 text-[12px] text-sub">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="file" size={14} className="text-primary" />
                {client.lastReportSent ? `Last branded report sent ${formatRelative(client.lastReportSent)}.` : "No report sent yet."}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="refresh" size={14} className="text-primary" />
                {lastSync ? `Last Google sync ${formatRelative(lastSync)}.` : live ? "Never synced from Google." : "Sample data — no Google sync."}
              </span>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Live snapshot of the client's workspace ─────────────── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            kicker="Latest reviews"
            title="What customers are saying"
            action={snapshot ? <span className="text-[12px] text-faint">{liveReviews.length} held</span> : undefined}
          />
          {recentReviews.length ? (
            <ul className="divide-y divide-soft">
              {recentReviews.map((review) => (
                <li key={review.id} className="flex items-start gap-3 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-[13px] font-bold text-primary-dark">
                    {review.author.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">{review.author}</span>
                      <span className="inline-flex items-center gap-px" aria-label={`${review.rating} out of 5 stars`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Icon key={n} name={n <= review.rating ? "star-fill" : "star"} size={12} className={n <= review.rating ? "text-gold" : "text-hairline"} />
                        ))}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-faint"><BrandLogo name="google" size={12} title="" /> {formatDate(review.publishedAt)}</span>
                      {review.reply ? <Badge tone="primary" icon="check">Replied</Badge> : review.needsReply ? <Badge tone="gold" icon="chat">Needs reply</Badge> : null}
                    </div>
                    {review.text ? <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-sub">{review.text}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-faint">
              {snapshot
                ? linked
                  ? "No reviews imported yet — sync from Google to pull the listing's reviews in."
                  : "Reviews appear once the Google listing is linked and synced."
                : unreadable}
            </p>
          )}
          {snapshot ? (
            <div className="mt-3">
              <Link href={`/agency/clients/${client.locationId}`} className="sr-only">This client</Link>
              <p className="text-[12px] text-faint">Open the client workspace to reply, draft with AI, or send new requests.</p>
            </div>
          ) : null}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader kicker="Six months" title="Reviews detected" />
            {reviewsByMonth.length && reviewsByMonth.some((bucket) => bucket.count) ? (
              <div role="img" aria-label={reviewsByMonth.map((bucket) => `${monthLabel(bucket.month)} ${bucket.count}`).join(", ")}>
                <div className="flex h-[110px] items-end gap-2" aria-hidden="true">
                  {reviewsByMonth.map((bucket) => (
                    <div key={bucket.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-[11px] tabular-nums text-sub">{bucket.count}</span>
                      <div className="w-full max-w-[28px] rounded-t-md bg-primary" style={{ height: `${Math.max(bucket.count ? 4 : 1, (bucket.count / maxMonth) * 100)}%` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2" aria-hidden="true">
                  {reviewsByMonth.map((bucket) => (
                    <div key={bucket.month} className="flex-1 text-center text-[11px] text-faint">{monthLabel(bucket.month)}</div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-faint">No reviews detected in the last six months.</p>
            )}
          </Card>

          <Card>
            <CardHeader kicker="Workspace" title="Customers & requests" />
            {snapshot ? (
              <dl className="space-y-2 text-[13px]">
                <div className="flex justify-between gap-3"><dt className="text-sub">Customers</dt><dd className="font-semibold tabular-nums text-ink">{snapshot.customers.length}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-sub">Requests sent</dt><dd className="font-semibold tabular-nums text-ink">{requestsSent}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-sub">Led to a detected review</dt><dd className="font-semibold tabular-nums text-ink">{requestsReviewed}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-sub">Staff on the capture app</dt><dd className="font-semibold tabular-nums text-ink">{snapshot.staff.filter((member) => member.active).length}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-sub">Profile completeness</dt><dd className="font-semibold tabular-nums text-ink">{snapshot.location.profile.completeness}%</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-sub">Workspace since</dt><dd className="font-semibold text-ink">{formatDate(snapshot.workspace.createdAt)}</dd></div>
              </dl>
            ) : (
              <p className="text-[13px] text-faint">{unreadable}</p>
            )}
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ClientGooglePanel
          clientId={client.locationId}
          clientName={client.name}
          city={client.city}
          linked={linked}
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
          agencyEmail={agencyEmail}
        />
      </div>

      <ClientDangerZone clientId={client.locationId} clientName={client.name} enabled={live} orphan={orphan} />
    </div>
  );
}
