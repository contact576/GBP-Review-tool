import { getData } from "@/lib/data";
import type { AeoQueryResult, Location } from "@/lib/data/types";
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
  /** A snapshot exists only when a check has actually tested questions. */
  const hasSnapshot = total > 0 || queries.length > 0;
  const detected = aeo ? formatDate(aeo.date) : null;

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

  const signals = profileSignals(data.location, queries);

  // Free teaser — the headline snapshot stays visible on every plan.
  const summary = hasSnapshot ? (
    <Card raised>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="kicker mb-1">This snapshot</div>
          <div className="text-[20px] font-extrabold text-ink">
            Named in <span className="tabular-nums">{named}</span> of{" "}
            <span className="tabular-nums">{total}</span> questions
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
  ) : (
    <Card raised>
      <EmptyState
        icon="sparkles"
        title="No AI Visibility check has run yet"
        description="Your answer share appears here once we test the buying questions people ask AI assistants near you. We never estimate a score in the meantime."
      />
    </Card>
  );

  // The full report — per-query breakdown + what drives being named. Pro-gated.
  const details = !hasSnapshot ? (
    <Card>
      <EmptyState
        icon="chat"
        title="Your full report appears after the first check"
        description="Every question we test, whether an AI named you, which competitors it named instead, and the profile signals behind the answer — all from a real detected snapshot, nothing invented."
      />
    </Card>
  ) : (
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

              {detected ? (
                <p className="mt-2 flex items-center gap-1 text-[11px] text-faint">
                  <Icon name="clock" size={12} /> Detected {detected}
                </p>
              ) : null}
            </Card>
          ))
        )}
      </div>

      {/* Signal panel — every row is read from this workspace's own profile
          and snapshot data; nothing here is written per-vertical. */}
      {signals.length > 0 ? (
        <Card>
          <CardHeader kicker="Signals" title="What drives whether you're named" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {signals.map((signal) => (
              <FactorRow
                key={signal.title}
                good={signal.good}
                title={signal.title}
                detail={signal.detail}
              />
            ))}
          </div>
          <p className="mt-3 border-t border-hairline pt-3 text-[12px] text-faint">
            Read from your Google profile and this snapshot — an assistant&apos;s ranking formula is
            not published, so these are the signals we can actually see, not a guaranteed cause.
          </p>
        </Card>
      ) : null}

      {detected ? (
        <div className="flex items-start gap-2 rounded-card border border-gold/40 bg-gold-tint/50 p-3">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-gold-deep" />
          <p className="text-[12px] text-gold-deep">
            AI answers change often — this is a detected snapshot from {detected}, not a live guarantee.
          </p>
        </div>
      ) : null}
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
        sub={`Whether AI assistants name ${data.location.name || "your business"} when people ask — answer-engine optimization (AEO).`}
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

interface ProfileSignal {
  title: string;
  detail: string;
  good: boolean;
}

/**
 * The signal rows, derived entirely from this workspace's own Google profile
 * state and its detected AEO snapshot. No vertical-specific copy: every string
 * is assembled from numbers the workspace actually has.
 */
function profileSignals(location: Location, queries: AeoQueryResult[]): ProfileSignal[] {
  const profile = location.profile;
  const signals: ProfileSignal[] = [];

  // Reviews — assistants quote rating and volume.
  signals.push(
    location.reviewCount > 0
      ? {
          good: location.rating >= 4.5,
          title: "Review strength",
          detail: `${location.rating.toFixed(1)}★ across ${location.reviewCount} Google reviews — the rating and volume an assistant can quote back.`,
        }
      : {
          good: false,
          title: "No reviews detected",
          detail: "Assistants lean on rating and review volume; none have been detected for your profile yet.",
        },
  );

  // Review replies.
  const replyPct = Math.round(profile.responseRate * 100);
  signals.push({
    good: profile.responseRate >= 0.8,
    title: "Review replies",
    detail: `You reply to ${replyPct}% of reviews. Replies add fresh, ownable text about what you do.`,
  });

  // Service descriptions.
  signals.push(
    profile.servicesTotal > 0
      ? {
          good: profile.servicesWithDescriptions >= profile.servicesTotal,
          title: "Service descriptions",
          detail: `${profile.servicesWithDescriptions} of ${profile.servicesTotal} listed services carry a description. Undescribed services are hard for an assistant to match to a question.`,
        }
      : {
          good: false,
          title: "No services listed",
          detail: "Your profile lists no services yet, so question-level matches have nothing to attach to.",
        },
  );

  // Hours.
  signals.push({
    good: profile.hoursSet && profile.holidayHoursSet,
    title: profile.hoursSet ? "Opening hours" : "Missing opening hours",
    detail: profile.hoursSet
      ? profile.holidayHoursSet
        ? "Regular and holiday hours are both published, so time-based questions can resolve to you."
        : "Regular hours are published; holiday hours are not, so date-specific questions can skip you."
      : "Hours aren't published, so “open now” style questions can't resolve to you.",
  });

  // Profile description.
  const descriptionWords = profile.description.trim().split(/\s+/).filter(Boolean).length;
  signals.push(
    descriptionWords > 0
      ? {
          good: descriptionWords >= 25,
          title: "Profile description",
          detail: `${descriptionWords} words describing the business. This is the text assistants paraphrase most.`,
        }
      : {
          good: false,
          title: "No profile description",
          detail: "There is no business description on your profile for an assistant to paraphrase.",
        },
  );

  // Where the answers went instead — straight from the snapshot.
  const missed = queries.filter((q) => !q.named).length;
  if (queries.length > 0) {
    const tally = new Map<string, number>();
    for (const q of queries) {
      if (q.named) continue;
      for (const name of q.competitorsNamed) tally.set(name, (tally.get(name) ?? 0) + 1);
    }
    const rivals = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    signals.push({
      good: missed === 0,
      title: missed === 0 ? "No missed questions" : "Questions going elsewhere",
      detail:
        missed === 0
          ? `An AI named you in all ${queries.length} questions we tested.`
          : `You went unnamed in ${missed} of ${queries.length} tested questions${namedInsteadClause(rivals)}.`,
    });
  }

  return signals;
}

/** " , where A and B were named instead" — built from detected names only. */
function namedInsteadClause(rivals: string[]): string {
  const [first, second] = rivals;
  if (first === undefined) return "";
  if (second === undefined) return `, where ${first} was named instead`;
  if (rivals.length === 2) return `, where ${first} and ${second} were named instead`;
  return `, where ${first}, ${second} and ${rivals.length - 2} others were named instead`;
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
