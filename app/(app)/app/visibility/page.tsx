import { getSessionAndData } from "@/lib/data";
import type { Location } from "@/lib/data/types";
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
import { hasAiKey } from "@/lib/ai/model";
import { formatDate } from "@/lib/utils/format";
import { buildAeoContext, SERVICES_SOURCE_COPY } from "@/lib/aeo/context";
import { aeoQuota } from "@/lib/aeo/metering";
import { AEO_DEFAULT_QUERY_COUNT, buildDefaultQueries } from "@/lib/aeo/queries";
import { NOT_CHECKED_COPY, type AeoCheckedQuery, type AeoQueryOutcome } from "@/lib/aeo/types";
import { providerDisplayName, viewFromSnapshot } from "@/lib/aeo/view";
import { GapToTask } from "./GapToTask";
import { RunCheck } from "./RunCheck";

export default async function VisibilityPage() {
  const { session, data } = await getSessionAndData();
  const entitled = hasFeature(
    data.subscription.tier,
    "ai_visibility",
    data.subscription.status === "trialing",
  );

  // The stored snapshot — written by POST /api/aeo/run via
  // `DataProvider.saveAeoSnapshot`, or seeded for the demo workspace. Never a
  // placeholder, never an estimate.
  const view = viewFromSnapshot(data.aeo);
  const results: AeoQueryOutcome[] = view?.results ?? [];
  const checkedResults: AeoCheckedQuery[] = results.filter(
    (result): result is AeoCheckedQuery => result.status === "checked",
  );

  const named = view?.headline.named ?? 0;
  const checked = view?.headline.checked ?? 0;
  const namedPct = checked > 0 ? Math.round((named / checked) * 100) : 0;
  const hasSnapshot = view !== null;
  const detected = view ? formatDate(view.ranAt) : null;

  // Attribution — which assistant, which exact model, which day. Rendered
  // wherever a number from this snapshot is, so no figure floats free of the
  // one assistant it came from.
  const attribution =
    view && detected ? (
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-faint">
        <span className="inline-flex items-center gap-1">
          <Icon name="sparkles" size={12} />
          {view.assistantLabel ?? "Assistant not recorded on this snapshot"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon name="clock" size={12} />
          Asked <span className="tabular-nums">{detected}</span>
        </span>
      </div>
    ) : null;

  const context = buildAeoContext(data);
  const plan = buildDefaultQueries(context, AEO_DEFAULT_QUERY_COUNT);
  const quota = aeoQuota(data.auditLog, data.subscription.tier);

  // Positioning breakdown across the questions we actually got a verdict for —
  // a genuine ≥3-slice part-of-whole (a 2-slice named/not donut is chartjunk,
  // DESIGN §3), with "Not named" painted neutral, never blended into a ramp.
  // Unchecked questions are excluded: they are not part of this whole.
  const namedDetailed = checkedResults.filter((q) => q.named).length;
  const topSpot = checkedResults.filter((q) => q.named && q.position === 1).length;
  const listed = checkedResults.filter((q) => q.named && q.position !== 1).length;
  const notNamed = checkedResults.filter((q) => !q.named).length;
  const positionSegments: DonutSegment[] = [
    { label: "Named — top spot", value: topSpot },
    { label: "Named — listed", value: listed },
    { label: "Not named", value: notNamed, color: NEUTRAL_SEG },
  ].filter((s) => s.value > 0);

  const signals = profileSignals(data.location, checkedResults);

  const runner = (
    <RunCheck
      queries={plan.queries}
      blockers={plan.blockers}
      quota={quota}
      providerConfigured={hasAiKey()}
      demoWorkspace={session.isDemo}
    />
  );

  // Free teaser — the headline snapshot stays visible on every plan.
  const summary = !hasSnapshot ? (
    <Card raised>
      <EmptyState
        icon="sparkles"
        title="No AI Visibility check has run yet"
        description="Your answer share appears here once we test the buying questions people ask AI assistants near you. We never estimate a score in the meantime."
      />
    </Card>
  ) : checked === 0 ? (
    <Card raised>
      <EmptyState
        icon="alert"
        title="The last check produced no verdicts"
        description="Every question in the last run came back unchecked, so there is no answer share to report. An unchecked question is not the same as being left out of the answer — the per-question reasons are below."
      />
    </Card>
  ) : (
    <Card raised>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="kicker mb-1">This snapshot</div>
          <div className="text-[20px] font-extrabold text-ink">
            Named in <span className="tabular-nums">{named}</span> of{" "}
            <span className="tabular-nums">{checked}</span> questions checked
          </div>
          <p className="mt-1 max-w-md text-[14px] text-sub">
            {view?.assistantLabel ?? "One AI assistant"} named you in{" "}
            <span className="tabular-nums">{namedPct}%</span> of the buying questions it was asked
            {detected ? " on " : ""}
            {detected ? <span className="tabular-nums">{detected}</span> : null}. Asked again, the
            same assistant can answer differently.
          </p>
          {attribution}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:w-[280px] sm:shrink-0 sm:divide-x sm:divide-hairline">
          <StatTile boxless label="Named in answers" value={`${named}/${checked}`} />
          <StatTile boxless label="Answer share" value={`${namedPct}%`} className="sm:pl-5" />
        </div>
      </div>
      <div className="mt-5">
        <ProgressMeter
          value={named}
          max={checked}
          label="Questions where an AI named you"
          valueText={`${named} of ${checked} checked`}
        />
      </div>
      {view && view.notChecked > 0 ? (
        <p className="mt-3 flex items-start gap-1.5 border-t border-hairline pt-3 text-[12px] text-faint">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
          <span className="tabular-nums">{view.notChecked}</span> further{" "}
          {view.notChecked === 1 ? "question was" : "questions were"} asked but could not be checked,
          so {view.notChecked === 1 ? "it is" : "they are"} left out of this fraction rather than
          counted against you.
        </p>
      ) : null}
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
      {/* How this was measured — stated before any of the numbers are read. */}
      <Card className="border-hairline bg-primary-wash/40">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-btn bg-card text-primary">
            <Icon name="eye" size={17} />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-ink">How this was measured</div>
            <p className="mt-1 text-[13px] text-sub">
              {view?.assistantLabel
                ? `We asked ${view.assistantLabel} ${results.length} ${results.length === 1 ? "question" : "questions"} on ${detected} and read its own answers for your business name.`
                : `This is a stored snapshot from ${detected}.`}{" "}
              It is a point-in-time sample of one assistant&apos;s answer — not a ranking, not a
              guarantee, and not a claim about what other AI assistants say. A model&apos;s answer
              is non-deterministic: the same question asked a minute later can name a different set
              of businesses.
            </p>
            {plan.basis.category ? (
              <p className="mt-2 text-[12px] text-faint">
                Questions were written from your category ({plan.basis.category})
                {plan.basis.city ? `, your city (${plan.basis.city})` : ""} and{" "}
                {SERVICES_SOURCE_COPY[context.servicesSource]}.
              </p>
            ) : null}

            {/* The exact assistant behind every figure on this page. */}
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-hairline pt-3">
              <div>
                <dt className="kicker">Assistant</dt>
                <dd className="text-[13px] font-semibold text-ink">
                  {view?.provider ? providerDisplayName(view.provider) : "Not recorded"}
                </dd>
              </div>
              <div>
                <dt className="kicker">Model</dt>
                <dd className="text-[13px] font-semibold tabular-nums text-ink">
                  {view?.model ?? "Not recorded"}
                </dd>
              </div>
              <div>
                <dt className="kicker">Run date</dt>
                <dd className="text-[13px] font-semibold tabular-nums text-ink">
                  {detected ?? "Not recorded"}
                </dd>
              </div>
            </dl>
            {view && !view.model ? (
              <p className="mt-2 text-[12px] text-faint">
                This snapshot predates model attribution, so the exact assistant behind it is not
                recorded. Run a new check to attribute the result to a named model.
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Positioning breakdown */}
      {checkedResults.length > 0 ? (
        <Card>
          <CardHeader
            kicker="Positioning"
            title="Where you place"
            action={
              <Badge tone="neutral" icon="sparkles">
                {checkedResults.length} checked
              </Badge>
            }
          />
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
            <Donut
              segments={positionSegments}
              centerValue={`${namedDetailed}/${checkedResults.length}`}
              centerLabel="named"
              title="Where you place"
            />
            <p className="max-w-xs text-[13px] text-sub">
              Across the {checkedResults.length} questions that returned a readable answer.
              &ldquo;Not named&rdquo; is shown as a neutral slice — never blended into a ranking
              colour. Questions we could not check are excluded entirely.
            </p>
          </div>
        </Card>
      ) : null}

      {/* Per-query results */}
      <div className="space-y-3">
        {results.length === 0 ? (
          <Card>
            <EmptyState
              icon="sparkles"
              title="No per-question detail in this snapshot"
              description="Run a check to see each question, the assistant's own words, and which businesses it named."
            />
          </Card>
        ) : (
          results.map((result) => (
            <Card key={result.query}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="kicker mb-0.5">Question asked</div>
                  <div className="text-[15px] font-bold text-ink">&ldquo;{result.query}&rdquo;</div>
                </div>
                {result.status === "not_checked" ? (
                  <Badge tone="sub" icon="alert" className="shrink-0 px-2 py-1 text-[12px]">
                    Not checked
                  </Badge>
                ) : result.named ? (
                  <Badge
                    tone="primary"
                    icon="check-circle"
                    className="shrink-0 px-2 py-1 text-[12px]"
                  >
                    Named{typeof result.position === "number" ? ` · #${result.position}` : ""}
                  </Badge>
                ) : (
                  <Badge tone="danger" icon="x" className="shrink-0 px-2 py-1 text-[12px]">
                    Not named
                  </Badge>
                )}
              </div>

              {result.status === "not_checked" ? (
                <>
                  <div className="mt-3 rounded-btn border border-hairline bg-hairline/30 p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                      <Icon name="alert" size={13} /> No verdict recorded
                    </div>
                    <p className="text-[13px] text-sub">{NOT_CHECKED_COPY[result.reason]}</p>
                  </div>
                  <p className="mt-2 text-[12px] text-faint">
                    This is not a &ldquo;not named&rdquo; result. We do not know what the assistant
                    would have answered, so nothing is recorded either way.
                  </p>
                </>
              ) : (
                <>
                  <div className="mt-3 rounded-btn border border-hairline bg-primary-wash/40 p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                      <Icon name="chat" size={13} /> The assistant&apos;s own words
                    </div>
                    <p className="text-[13px] italic text-sub">
                      &ldquo;{result.answerExcerpt}&rdquo;
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {result.competitorsNamed.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[12px] text-faint">Also named in this answer:</span>
                        {result.competitorsNamed.map((competitor) => (
                          <Badge key={competitor} tone="sub">
                            {competitor}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[12px] text-faint">
                        No other business was named in this answer.
                      </span>
                    )}
                    {!result.named ? (
                      <div className="ml-auto">
                        <GapToTask query={result.query} />
                      </div>
                    ) : null}
                  </div>
                </>
              )}

              {detected ? (
                <p className="mt-2 flex items-center gap-1 text-[11px] text-faint">
                  <Icon name="clock" size={12} /> Asked {detected}
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
          <CardHeader kicker="Signals" title="What an assistant can read about you" />
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
            not published, so these are the signals we can actually see. None of them is shown here
            as a cause of being named.
          </p>
        </Card>
      ) : null}

      {detected ? (
        <div className="flex items-start gap-2 rounded-card border border-gold/40 bg-gold-tint/50 p-3">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-gold-deep" />
          <p className="text-[12px] text-gold-deep">
            AI answers change often — this is one assistant&apos;s answer on {detected}, not a live
            guarantee and not a ranking you hold.
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
            <Badge tone="gold" icon="sparkles">
              Pro
            </Badge>
          </span>
        }
        sub={`Whether one AI assistant names ${data.location.name || "your business"} when people ask — answer-engine optimization (AEO).`}
      />

      {entitled ? runner : null}

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
 *
 * These rows describe what an assistant can READ. None of them asserts that a
 * signal causes the business to be named — that link is not published by any
 * assistant and is not something this product can measure.
 */
function profileSignals(location: Location, queries: AeoCheckedQuery[]): ProfileSignal[] {
  const profile = location.profile;
  const signals: ProfileSignal[] = [];

  // Reviews — the rating and volume that exist as quotable text.
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
          detail: "There is no rating or review volume on your profile for an assistant to quote.",
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
          detail: `${profile.servicesWithDescriptions} of ${profile.servicesTotal} listed services carry a description. A service with no description gives an assistant no text to read.`,
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
        ? "Regular and holiday hours are both published, so time-based questions have something to read."
        : "Regular hours are published; holiday hours are not, so date-specific questions have nothing to read."
      : "Hours aren't published, so “open now” style questions have nothing to read.",
  });

  // Profile description.
  const descriptionWords = profile.description.trim().split(/\s+/).filter(Boolean).length;
  signals.push(
    descriptionWords > 0
      ? {
          good: descriptionWords >= 25,
          title: "Profile description",
          detail: `${descriptionWords} words describing the business. This is the profile text an assistant has to work from.`,
        }
      : {
          good: false,
          title: "No profile description",
          detail: "There is no business description on your profile for an assistant to read.",
        },
  );

  // Where the answers went instead — straight from the checked results only.
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
          ? `An AI named you in all ${queries.length} questions it answered.`
          : `You went unnamed in ${missed} of ${queries.length} checked questions${namedInsteadClause(rivals)}.`,
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
