import { getData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge, EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Paywall } from "@/components/app/Paywall";
import { Icon } from "@/components/icons";
import { StatTile } from "@/components/charts/StatTile";
import { ProgressMeter } from "@/components/charts/ProgressMeter";
import { Donut, type DonutSegment } from "@/components/charts/Donut";
import { NEUTRAL_SEG } from "@/components/charts/tokens";
import { hasFeature } from "@/lib/billing/plans";
import { formatDate } from "@/lib/utils/format";
import { GapToTask } from "./GapToTask";

export default async function VisibilityPage() {
  const data = await getData();
  const entitled = hasFeature(
    data.subscription.tier,
    "ai_visibility",
    data.subscription.status === "trialing",
  );
  const aeo = data.aeo;
  const queries = aeo?.queries ?? [];
  const named = aeo?.namedFraction.named ?? 0;
  const total = aeo?.namedFraction.total ?? 0;
  const namedPct = total > 0 ? Math.round((named / total) * 100) : 0;
  const detected = aeo ? formatDate(aeo.date) : formatDate(new Date().toISOString());

  // What actually drives being named, read off the latest profile audit. Open
  // findings are the gaps; the checks that passed are the strengths. Nothing
  // here is written by hand, so it can never describe a business we didn't scan.
  const auditFindings = data.location.gbpAudit?.findings ?? [];
  const factors = [
    ...auditFindings
      .filter((finding) => finding.status === "open")
      .slice(0, 3)
      .map((finding) => ({
        good: false,
        title: finding.title,
        detail: finding.rationale,
      })),
    ...(data.location.rating >= 4.3 && data.location.reviewCount > 0
      ? [{
          good: true,
          title: "Strong star rating",
          detail: `${data.location.rating.toFixed(1)}★ across ${data.location.reviewCount} Google reviews makes you a safe recommendation.`,
        }]
      : []),
  ].slice(0, 4);

  // Positioning breakdown across the questions we actually detail below —
  // a genuine ≥3-slice part-of-whole (a 2-slice named/not donut is chartjunk,
  // DESIGN §3), with "Not named" painted neutral, never blended into a ramp.
  const namedDetailed = queries.filter((q) => q.named).length;
  const topSpot = queries.filter((q) => q.named && q.position === 1).length;
  const listed = queries.filter((q) => q.named && q.position !== 1).length;
  const notNamed = queries.filter((q) => !q.named).length;
  const positionSegments: DonutSegment[] = [
    { label: "Named — top spot", value: topSpot },
    { label: "Named — listed", value: listed },
    { label: "Not named", value: notNamed, color: NEUTRAL_SEG },
  ].filter((s) => s.value > 0);

  // Free teaser — the headline snapshot stays visible on every plan.
  const summary = (
    <Card raised>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="kicker mb-1">This snapshot</div>
          <div className="text-[20px] font-extrabold text-ink">
            Named in {named} of {total} questions
          </div>
          <p className="mt-1 max-w-md text-[14px] text-sub">
            You appear in AI answers for {namedPct}% of the buying questions we tested nearby.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:w-[280px] sm:shrink-0 sm:divide-x sm:divide-hairline">
          <StatTile boxless label="Named in answers" value={`${named}/${total}`} />
          <StatTile boxless label="Answer share" value={`${namedPct}%`} className="sm:pl-5" />
        </div>
      </div>
      <div className="mt-5">
        <ProgressMeter
          value={named}
          max={total}
          label="Questions where an AI named you"
          valueText={`${named} of ${total} tested`}
        />
      </div>
    </Card>
  );

  // The full report — per-query breakdown + what drives being named. Pro-gated.
  const details = (
    <div className="space-y-5">
      {/* Positioning breakdown */}
      {queries.length > 0 ? (
        <Card>
          <CardHeader
            kicker="Positioning"
            title="Where you place"
            action={<Badge tone="neutral" icon="sparkles">{queries.length} questions</Badge>}
          />
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
            <Donut
              segments={positionSegments}
              centerValue={`${namedDetailed}/${queries.length}`}
              centerLabel="named"
              title="Where you place"
            />
            <p className="max-w-xs text-[13px] text-sub">
              Across the {queries.length} buying questions detailed below. &ldquo;Not named&rdquo; is
              shown as a neutral slice — never blended into a ranking colour.
            </p>
          </div>
        </Card>
      ) : null}

      {/* Per-query results */}
      <div className="space-y-3">
        {queries.length === 0 ? (
          <Card>
            <EmptyState
              icon="sparkles"
              title="No AI Visibility snapshot yet"
              description="Once we test buying questions nearby, your results will appear here."
            />
          </Card>
        ) : (
          queries.map((q) => (
            <Card key={q.query}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="kicker mb-0.5">Question asked</div>
                  <div className="text-[15px] font-bold text-ink">&ldquo;{q.query}&rdquo;</div>
                </div>
                {q.named ? (
                  <Badge tone="primary" icon="check-circle" className="shrink-0 px-2 py-1 text-[12px]">
                    Named{typeof q.position === "number" ? ` · #${q.position}` : ""}
                  </Badge>
                ) : (
                  <Badge tone="danger" icon="x" className="shrink-0 px-2 py-1 text-[12px]">
                    Not named
                  </Badge>
                )}
              </div>

              <div className="mt-3 rounded-btn border border-hairline bg-primary-wash/40 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                  <Icon name="chat" size={13} /> Answer excerpt
                </div>
                <p className="text-[13px] italic text-sub">&ldquo;{q.answerExcerpt}&rdquo;</p>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {q.competitorsNamed.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] text-faint">Competitors named:</span>
                    {q.competitorsNamed.map((c) => (
                      <Badge key={c} tone="sub">{c}</Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-[12px] text-faint">No competitors named here.</span>
                )}
                {!q.named ? <div className="ml-auto"><GapToTask query={q.query} /></div> : null}
              </div>

              <p className="mt-2 flex items-center gap-1 text-[11px] text-faint">
                <Icon name="clock" size={12} /> Detected {detected}
              </p>
            </Card>
          ))
        )}
      </div>

      {/* Factor panel — derived from the latest audit, never hardcoded copy */}
      <Card>
        <CardHeader kicker="Signals" title="What drives whether you're named" />
        {factors.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {factors.map((factor) => (
              <FactorRow key={factor.title} good={factor.good} title={factor.title} detail={factor.detail} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="search"
            title="No profile signals yet"
            description="Sync your Google data so we can show which parts of your profile help or hurt whether an AI names you."
          />
        )}
      </Card>

      <div className="flex items-start gap-2 rounded-card border border-gold/40 bg-gold-tint/50 p-3">
        <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-gold-deep" />
        <p className="text-[12px] text-gold-deep">
          AI answers change often — this is a detected snapshot from {detected}, not a live guarantee.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            AI Visibility
            <Badge tone="gold" icon="sparkles">Pro</Badge>
          </span>
        }
        sub="Whether AI assistants name your clinic when people ask — answer-engine optimization (AEO)."
      />

      {summary}

      {entitled ? (
        details
      ) : (
        <Paywall feature="ai_visibility" title="See your full AI Visibility report">
          {details}
        </Paywall>
      )}
    </div>
  );
}

function FactorRow({ title, detail, good }: { title: string; detail: string; good?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 rounded-btn border border-hairline p-3">
      <div
        className={
          good
            ? "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary-tint text-primary-dark"
            : "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-gold-tint text-gold-deep"
        }
      >
        <Icon name={good ? "check" : "arrow-up"} size={14} />
      </div>
      <div>
        <div className="text-[13px] font-semibold text-ink">{title}</div>
        <p className="text-[12px] text-sub">{detail}</p>
      </div>
    </div>
  );
}
