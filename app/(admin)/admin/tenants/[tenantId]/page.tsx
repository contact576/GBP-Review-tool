import { notFound } from "next/navigation";
import { getSessionAndData, getTenantDetail } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardHeader } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Icon } from "@/components/icons";
import { StatTile } from "@/components/charts/StatTile";
import { formatDate, formatMoney, formatRelative } from "@/lib/utils/format";
import { trialState } from "@/lib/billing/trial";
import { PLANS, normalizePlan } from "@/lib/billing/plans";
import { TenantStatusBadge } from "../../../_components/TenantStatus";
import {
  OpenTenantButton,
  TenantDangerZone,
  TenantSubscriptionPanel,
  TenantUsersPanel,
} from "./TenantDetailPanels";

export default async function AdminTenantPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const [{ session }, detail] = await Promise.all([getSessionAndData(), getTenantDetail(decodeURIComponent(tenantId))]);
  if (!detail) notFound();
  const { tenant, organization, workspaces, users, audit } = detail;
  const primary = workspaces[0]!;
  const canAct = !session.isDemo;
  const totals = workspaces.reduce(
    (sum, ws) => ({
      customers: sum.customers + ws.counts.customers,
      requests: sum.requests + ws.counts.requests,
      reviews: sum.reviews + ws.counts.reviews,
      needsReply: sum.needsReply + ws.counts.needsReply,
    }),
    { customers: 0, requests: 0, reviews: 0, needsReply: 0 },
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <LinkButton href="/admin/tenants" variant="ghost" size="sm" icon="chevron-left">Tenants</LinkButton>
        <span className="text-faint">/</span>
        <span className="font-semibold text-ink">{tenant.name}</span>
      </div>

      <PageHeader
        title={tenant.name}
        sub={`${organization.orgType === "agency" ? "Agency" : "Direct"} tenant · ${workspaces.length} location${workspaces.length === 1 ? "" : "s"} · ${tenant.region} · since ${formatDate(tenant.createdAt ?? primary.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TenantStatusBadge status={tenant.status} />
            <Badge tone="neutral">{PLANS[normalizePlan(tenant.plan)].name}</Badge>
            <OpenTenantButton workspaceId={tenant.primaryWorkspaceId} tenantName={tenant.name} enabled={canAct} />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="MRR" value={formatMoney(tenant.mrr)} deltaCaption="Billed at plan price" />
        <StatTile label="Customers" value={totals.customers} deltaCaption="Across locations" />
        <StatTile label="Review requests" value={totals.requests} deltaCaption="Real sends, all time" />
        <StatTile label="Google reviews" value={totals.reviews} deltaCaption={`${totals.needsReply} awaiting reply`} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader kicker="Locations" title="Workspaces" />
            <ul className="divide-y divide-hairline">
              {workspaces.map((ws) => {
                const trial = trialState(ws.subscription);
                return (
                  <li key={ws.workspaceId} className="space-y-2 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-semibold text-ink">{ws.name}</div>
                        <div className="truncate text-[12px] text-sub">
                          {ws.city || "City not set"} · {ws.vertical} · <code className="text-[11px]">{ws.workspaceId}</code>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="neutral">{PLANS[normalizePlan(ws.subscription.tier)].name} · {ws.subscription.interval}</Badge>
                        <TenantStatusBadge
                          status={
                            ws.subscription.status === "past_due"
                              ? "past_due"
                              : ws.subscription.status === "trialing"
                                ? "trialing"
                                : ws.subscription.status === "active" && normalizePlan(ws.subscription.tier) !== "free"
                                  ? "active"
                                  : "free"
                          }
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-sub">
                      <span>{ws.rating.toFixed(1)}★ · {ws.reviewCount} reviews</span>
                      <span>{ws.counts.customers} customers · {ws.counts.requests} requests · {ws.counts.staff} staff</span>
                      {ws.counts.requestsFailed30d ? (
                        <span className="text-danger">{ws.counts.requestsFailed30d} failed/suppressed sends · 30d</span>
                      ) : null}
                      {trial.phase === "trialing" || trial.phase === "ending_soon" ? (
                        <span>Trial ends {trial.endsAt ? formatDate(trial.endsAt) : "—"} ({trial.daysLeft}d)</span>
                      ) : trial.phase === "expired" ? (
                        <span className="text-gold-deep">Trial expired {trial.daysSinceEnd}d ago</span>
                      ) : null}
                      {ws.lastActivityAt ? <span>Last activity {formatRelative(ws.lastActivityAt)}</span> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={ws.googleLinked ? "primary" : "sub"} icon={ws.googleLinked ? "check-circle" : "alert"}>
                        {ws.googleLinked ? "Google listing linked" : "No Google listing"}
                      </Badge>
                      <Badge tone={ws.gbpConnected ? "primary" : "sub"} icon={ws.gbpConnected ? "check-circle" : "lock"}>
                        {ws.gbpConnected ? "Business Profile connected" : "Profile not connected"}
                      </Badge>
                      <Badge tone={ws.emailSenderConnected ? "primary" : "sub"} icon="mail">
                        {ws.emailSenderConnected ? "Own email sender" : "Platform email"}
                      </Badge>
                      {ws.subscription.stripeCustomerId ? (
                        <Badge tone="primary" icon="credit-card">Stripe customer</Badge>
                      ) : (
                        <Badge tone="sub" icon="credit-card">No Stripe customer</Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <TenantUsersPanel users={users} enabled={canAct} />

          <Card>
            <CardHeader kicker="Ledger" title="Recent audit entries" action={<LinkButton href="/admin/audit" variant="ghost" size="sm" iconRight="chevron-right">All tenants</LinkButton>} />
            {audit.length ? (
              <ul className="divide-y divide-hairline">
                {audit.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <code className="rounded-chip bg-primary-wash px-1.5 py-0.5 text-[12px] font-semibold text-primary-dark">{entry.action}</code>
                      <span className="ml-2 text-[12px] text-sub">{entry.actor} · {entry.tenant}</span>
                    </div>
                    <span className="shrink-0 text-[12px] tabular-nums text-faint">{formatRelative(entry.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-faint">No privileged action has been written to this tenant&rsquo;s ledger yet.</p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <TenantSubscriptionPanel
            workspaces={workspaces.map((ws) => ({
              workspaceId: ws.workspaceId,
              name: ws.name,
              tier: normalizePlan(ws.subscription.tier),
              status: ws.subscription.status,
              interval: ws.subscription.interval,
              trialEndsAt: ws.subscription.trialEndsAt,
              stripeSubscriptionId: ws.subscription.stripeSubscriptionId,
            }))}
            enabled={canAct}
          />

          <Card>
            <CardHeader kicker="Account" title="Organization" />
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between gap-3"><dt className="text-sub">Legal name</dt><dd className="text-right font-medium text-ink">{organization.legalName}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-sub">Billing email</dt><dd className="truncate text-right font-medium text-ink">{organization.billingEmail}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-sub">Owner</dt><dd className="truncate text-right font-medium text-ink">{tenant.ownerEmail ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-sub">Organization id</dt><dd className="text-right"><code className="text-[11px]">{organization.id}</code></dd></div>
            </dl>
            <p className="mt-3 flex items-start gap-1.5 text-[12px] text-faint">
              <Icon name="lock" size={13} className="mt-px shrink-0" />
              Every change made here is written to this tenant&rsquo;s own audit log naming the operator.
            </p>
          </Card>

          <TenantDangerZone organizationId={organization.id} tenantName={tenant.name} workspaces={workspaces.length} users={users.length} enabled={canAct} />
        </div>
      </div>
    </div>
  );
}
