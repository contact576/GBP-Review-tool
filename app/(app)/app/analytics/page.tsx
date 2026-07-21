import { getData } from "@/lib/data";
import { buildDashboardModel, type DashboardSignal } from "@/lib/data/dashboard";
import { Card, CardHeader } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Badge, EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { DashboardTrendCard } from "@/components/app/DashboardTrendCard";
import { Icon, type IconName } from "@/components/icons";
import { Donut, type DonutSegment } from "@/components/charts/Donut";
import { NEUTRAL_SEG } from "@/components/charts/tokens";
import { formatNumber } from "@/lib/utils/format";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { SectionNav } from "./SectionNav";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "trends", label: "Trends" },
  { id: "breakdown", label: "Rating mix" },
  { id: "activity", label: "Request funnel" },
  { id: "sources", label: "Sources" },
];

export default async function AnalyticsPage() {
  const data = await getData();
  const dashboard = buildDashboardModel(data);
  const reviews = data.reviews ?? [];

  const five = reviews.filter((review) => review.rating === 5).length;
  const four = reviews.filter((review) => review.rating === 4).length;
  const lower = reviews.filter((review) => review.rating <= 3).length;
  const ratingSegments: DonutSegment[] = [
    { label: "5 stars", value: five },
    { label: "4 stars", value: four },
    { label: "3 stars or lower", value: lower, color: NEUTRAL_SEG },
  ].filter((segment) => segment.value > 0);

  const requests = data.requests ?? [];
  const requestFunnel = [
    { label: "Accepted by delivery provider", value: requests.filter((request) => Boolean(request.sentAt)).length },
    { label: "Opened", value: requests.filter((request) => Boolean(request.openedAt)).length },
    { label: "Review-page handoffs", value: requests.filter((request) => Boolean(request.clickedAt)).length },
    { label: "Private feedback received", value: requests.filter((request) => Boolean(request.privateFeedback)).length },
  ];

  const signals = [dashboard.foundYou, dashboard.contactedYou, dashboard.newReviews];

  return (
    <div>
      <PageHeader
        kicker="Performance intelligence"
        title="Analytics"
        sub={<>Verified discovery, customer actions, review momentum, and Foundly request activity for {data.location.name}.</>}
        actions={<LinkButton href="/app/report" variant="secondary" size="sm" icon="file">View growth report</LinkButton>}
      />

      <SectionNav sections={SECTIONS} />

      <section id="overview" className="scroll-mt-[128px] pt-4">
        <SectionTitle icon="chart" title="Rolling 30 days at a glance" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SignalTile signal={dashboard.foundYou} label="People found you" icon="eye" />
          <SignalTile signal={dashboard.contactedYou} label="People contacted you" icon="phone" />
          <SignalTile signal={dashboard.newReviews} label="New reviews" icon="star" />
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-faint">
          <Icon name="shield" size={13} className="mt-0.5 shrink-0" />
          Values remain unavailable until their own verified source is connected; a missing signal is never rendered as zero.
        </p>
      </section>

      <section id="trends" className="scroll-mt-[128px] pt-8">
        <SectionTitle icon="trend" title="Discovery and conversion trends" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <DashboardTrendCard
            signal={dashboard.foundYou}
            kicker="Google profile views"
            label="People found you"
            description="Rolling profile impressions across Search and Maps; not a unique-person count."
            icon="eye"
          />
          <DashboardTrendCard
            signal={dashboard.contactedYou}
            kicker="Calls, directions and website taps"
            label="People contacted you"
            description="Rolling customer actions; one customer may complete more than one action."
            icon="phone"
          />
        </div>
      </section>

      <section id="breakdown" className="scroll-mt-[128px] pt-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              kicker="Reputation"
              title="Review rating mix"
              action={<Badge tone="neutral" icon="google">Imported Google reviews</Badge>}
            />
            {reviews.length ? (
              <div className="flex justify-center py-2">
                <Donut
                  segments={ratingSegments}
                  centerValue={reviews.length}
                  centerLabel="imported"
                  title="Imported review rating mix"
                />
              </div>
            ) : (
              <EmptyState
                icon="star"
                title="No reviews imported"
                description="Connect Google review access before Foundly calculates the rating mix."
                action={<LinkButton href="/app/settings/integrations" variant="secondary" size="sm">Review connection</LinkButton>}
              />
            )}
            <p className="mt-2 text-[12px] leading-relaxed text-faint">
              Distribution of the Google reviews currently imported into Foundly. Public samples may not represent full history.
            </p>
          </Card>

          <div id="activity" className="scroll-mt-[128px]">
            <RequestFunnel rows={requestFunnel} />
          </div>
        </div>
      </section>

      <section id="sources" className="scroll-mt-[128px] pt-8">
        <Card>
          <CardHeader kicker="Provenance" title="Metric sources" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="kicker py-2 pr-4 font-bold">Metric</th>
                  <th className="kicker py-2 pr-4 font-bold">Status</th>
                  <th className="kicker py-2 pr-4 font-bold">Source</th>
                  <th className="kicker py-2 font-bold">Window</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {signals.map((signal) => (
                  <tr key={signal.key}>
                    <td className="py-3 pr-4 font-semibold text-ink">{signalLabel(signal.key)}</td>
                    <td className="py-3 pr-4"><SignalStatus signal={signal} /></td>
                    <td className="py-3 pr-4 text-sub">{signal.source}</td>
                    <td className="py-3 text-sub">Rolling 30 days</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="mt-4 flex items-start gap-2 rounded-card border border-hairline bg-primary-wash/40 p-3">
          <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-[13px] text-sub">{MICROCOPY.actionsNotCustomers}</p>
        </div>
      </section>
    </div>
  );
}

function SignalTile({ signal, label, icon }: { signal: DashboardSignal; label: string; icon: IconName }) {
  const available = (signal.status === "ready" || signal.status === "stale") && signal.value !== null;
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-9 place-items-center rounded-btn bg-primary-wash text-primary">
          <Icon name={icon} size={17} />
        </span>
        <SignalStatus signal={signal} />
      </div>
      <div className="mt-5 text-[12px] font-semibold text-sub">{label}</div>
      <div className="mt-1 text-[34px] font-extrabold leading-none tracking-tight text-ink tabular-nums">
        {available ? formatNumber(signal.value!) : "—"}
      </div>
      <div className="mt-2 flex min-h-5 items-center gap-2 text-[11px] text-faint">
        {available ? (
          <>
            {signal.delta !== null ? (
              <span className={signal.delta >= 0 ? "font-semibold text-primary" : "font-semibold text-danger"}>
                {signal.delta >= 0 ? "↑" : "↓"} {Math.abs(signal.delta)}%
              </span>
            ) : null}
            <span>vs prior window · {signal.source}</span>
          </>
        ) : (
          <span>{signal.status === "pending_approval" ? "Google access is pending" : "Verified source required"}</span>
        )}
      </div>
    </Card>
  );
}

function SignalStatus({ signal }: { signal: DashboardSignal }) {
  if (signal.status === "ready") return <Badge tone="primary" icon="check-circle">Ready</Badge>;
  if (signal.status === "stale") return <Badge tone="gold" icon="clock">Stale</Badge>;
  if (signal.status === "pending_approval") return <Badge tone="gold" icon="clock">Pending</Badge>;
  return <Badge tone="sub" icon="lock">Unavailable</Badge>;
}

function RequestFunnel({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(0, ...rows.map((row) => row.value));
  return (
    <Card>
      <CardHeader
        kicker="Foundly activity"
        title="Review request funnel"
        action={<LinkButton href="/app/requests" variant="ghost" size="sm" iconRight="chevron-right">Requests</LinkButton>}
      />
      {max ? (
        <div className="space-y-4 pt-1">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                <span className="text-sub">{row.label}</span>
                <span className="font-bold text-ink tabular-nums">{formatNumber(row.value)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-chip bg-primary-wash">
                <div className="h-full rounded-chip bg-primary" style={{ width: `${(row.value / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="send"
          title="No delivered requests yet"
          description="Provider-accepted sends, opens, handoffs, and private feedback will appear here."
          action={<LinkButton href="/app/requests" size="sm">Send a request</LinkButton>}
        />
      )}
      <p className="mt-4 text-[12px] leading-relaxed text-faint">
        Foundly records the handoff to Google, not whether a customer ultimately publishes a review.
      </p>
    </Card>
  );
}

function SectionTitle({ icon, title }: { icon: IconName; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="grid size-7 place-items-center rounded-btn bg-primary-wash text-primary">
        <Icon name={icon} size={15} />
      </span>
      <h2 className="text-[15px] font-bold text-ink">{title}</h2>
    </div>
  );
}

function signalLabel(key: DashboardSignal["key"]): string {
  if (key === "foundYou") return "People found you";
  if (key === "contactedYou") return "People contacted you";
  return "New Google reviews";
}
