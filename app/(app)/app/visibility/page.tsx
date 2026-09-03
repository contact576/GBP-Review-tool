import { getSessionAndData } from "@/lib/data";
import type { Location } from "@/lib/data/types";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge, EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Paywall } from "@/components/app/Paywall";
import { Icon, type IconName } from "@/components/icons";
import { StatTile } from "@/components/charts/StatTile";
import { ProgressMeter } from "@/components/charts/ProgressMeter";
import { upgradeFor } from "@/lib/billing/plans";
import { subscriptionHasFeature } from "@/lib/billing/trial";
import { formatDate } from "@/lib/utils/format";
import { buildAeoContext, SERVICES_SOURCE_COPY } from "@/lib/aeo/context";
import { engineAvailability } from "@/lib/aeo/engines";
import { aeoQuota } from "@/lib/aeo/metering";
import type { AeoEngineOutcome, AeoMultiRunRecord } from "@/lib/aeo/multi";
import { multiFromSnapshot } from "@/lib/aeo/persistence";
import { AEO_DEFAULT_QUERY_COUNT, buildDefaultQueries } from "@/lib/aeo/queries";
import { NOT_CHECKED_COPY, isChecked, type AeoCheckedQuery, type AeoQueryOutcome } from "@/lib/aeo/types";
import { viewFromSnapshot } from "@/lib/aeo/view";
import { EngineGrid } from "./EngineGrid";
import { GapToTask } from "./GapToTask";
import { RunCheck } from "./RunCheck";

const GROUNDING_COPY: Record<AeoEngineOutcome["grounding"], { label: string; icon: IconName }> = {
  web_search: { label: "Searches the live web", icon: "search" },
  model_knowledge: { label: "Model knowledge", icon: "sparkles" },
};

function pct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

function position(value: number | null): string {
  return value === null ? "—" : `#${value % 1 === 0 ? value : value.toFixed(1)}`;
}

export default async function VisibilityPage() {
  const { session, data } = await getSessionAndData();
  // Named from the plan catalog, never typed into copy. "Pro" was folded into
  // Growth (LEGACY_PLAN_ALIASES in lib/billing/plans.ts) and this page kept
  // advertising the retired name; `upgradeFor` reads the lowest plan that
  // actually carries `ai_visibility`, so the badge cannot drift again.
  const visibilityPlan = upgradeFor("ai_visibility");
  // Trial-aware: an expired trial is locked here even though the row still
  // says `trialing` / `growth` (lib/billing/trial.ts).
  const entitled = subscriptionHasFeature(data.subscription, "ai_visibility");

  const context = buildAeoContext(data);
  const businessName = context.businessName || data.location.name;

  // The stored snapshot — written by POST /api/aeo/run via
  // `DataProvider.saveAeoSnapshot`, or seeded for the demo workspace. Never a
  // placeholder, never an estimate. A snapshot that predates engines is read
  // through the single-assistant view and said to be exactly that.
  const multi = multiFromSnapshot(data.aeo, { businessName });
  const legacy = multi ? null : viewFromSnapshot(data.aeo);
  const ranAt = multi?.ranAt ?? legacy?.ranAt ?? null;
  const detected = ranAt ? formatDate(ranAt) : null;
  const hasSnapshot = multi !== null || legacy !== null;

  const plan = buildDefaultQueries(context, AEO_DEFAULT_QUERY_COUNT);
  const quota = aeoQuota(data.auditLog, data.subscription.tier);
  const availability = engineAvailability();

  // Every checked answer across every engine — what the signals panel reads.
  const checkedAcrossEngines: AeoCheckedQuery[] = multi
    ? multi.engines.flatMap((engine) => engine.results.filter(isChecked))
    : (legacy?.results ?? []).filter(isChecked);

  const signals = profileSignals(data.location, checkedAcrossEngines);
  const answered = multi?.engines.filter((engine) => engine.state === "answered") ?? [];

  const runner = (
    <RunCheck
      queries={plan.queries}
      blockers={plan.blockers}
      quota={quota}
      engines={availability.map((entry) => ({
        id: entry.id,
        productName: entry.descriptor.productName,
        connected: entry.connected,
        model: entry.connected ? entry.model : null,
        missing: entry.missing,
      }))}
      demoWorkspace={session.isDemo}
    />
  );

  // ── Headline ──────────────────────────────────────────────────────────────
  const summary = !hasSnapshot ? (
    <Card raised>
      <EmptyState
        icon="sparkles"
        title="No AI Visibility check has run yet"
        description="Your presence across ChatGPT, Claude, Gemini and Perplexity appears here once we put the buying questions people ask to every engine we can reach. We never estimate a score in the meantime."
      />
    </Card>
  ) : multi ? (
    multi.summary.answersChecked === 0 ? (
      <Card raised>
        <EmptyState
          icon="alert"
          title="The last check produced no verdicts"
          description="Every answer in the last run came back unchecked, so there is no presence to report. An unchecked answer is not the same as being left out of it — the per-engine reasons are below."
        />
      </Card>
    ) : (
      <Card raised>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="kicker mb-1">Across AI engines</div>
            <div className="text-[22px] font-extrabold leading-tight text-ink">
              Named in <span className="tabular-nums">{multi.summary.answersNamed}</span> of{" "}
              <span className="tabular-nums">{multi.summary.answersChecked}</span> AI answers
            </div>
            <p className="mt-1.5 max-w-lg text-[14px] text-sub">
              <span className="tabular-nums">{multi.summary.enginesConnected}</span> of{" "}
              <span className="tabular-nums">{multi.summary.enginesTotal}</span> engines were asked{" "}
              <span className="tabular-nums">{multi.queries.length}</span> buying questions each
              {detected ? (
                <>
                  {" "}
                  on <span className="tabular-nums">{detected}</span>
                </>
              ) : null}
              . Each engine can answer differently, and the same engine asked again can too.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-faint">
              {answered.map((engine) => (
                <span key={engine.engineId} className="inline-flex items-center gap-1">
                  <Icon name="sparkles" size={12} />
                  {engine.productName}
                  {engine.model ? <span className="tabular-nums">({engine.model})</span> : null}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:w-[520px] lg:shrink-0 lg:divide-x lg:divide-hairline">
            <StatTile boxless label="Presence rate" value={pct(multi.summary.presenceRate)} />
            <StatTile boxless label="Average position" value={position(multi.summary.averagePosition)} className="lg:pl-5" />
            <StatTile
              boxless
              label="Named on any engine"
              value={`${multi.summary.questionsNamedOnAny}/${multi.summary.questionsChecked}`}
              className="lg:pl-5"
            />
            <StatTile
              boxless
              label="Named on every engine"
              value={`${multi.summary.questionsNamedOnAll}/${multi.summary.questionsChecked}`}
              className="lg:pl-5"
            />
          </div>
        </div>
        <div className="mt-5">
          <ProgressMeter
            value={multi.summary.answersNamed}
            max={multi.summary.answersChecked}
            label="AI answers that named you"
            valueText={`${multi.summary.answersNamed} of ${multi.summary.answersChecked} checked`}
          />
        </div>
        <NotCheckedNote multi={multi} />
      </Card>
    )
  ) : legacy ? (
    <Card raised>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="kicker mb-1">Single-assistant snapshot</div>
          <div className="text-[20px] font-extrabold text-ink">
            Named in <span className="tabular-nums">{legacy.headline.named}</span> of{" "}
            <span className="tabular-nums">{legacy.headline.checked}</span> questions checked
          </div>
          <p className="mt-1 max-w-md text-[14px] text-sub">
            {legacy.assistantLabel ?? "One AI assistant"} answered these
            {detected ? (
              <>
                {" "}
                on <span className="tabular-nums">{detected}</span>
              </>
            ) : null}
            . This snapshot predates multi-engine checks — run a new one to compare ChatGPT, Claude,
            Gemini and Perplexity side by side.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:w-[280px] sm:shrink-0 sm:divide-x sm:divide-hairline">
          <StatTile boxless label="Named in answers" value={`${legacy.headline.named}/${legacy.headline.checked}`} />
          <StatTile
            boxless
            label="Answer share"
            value={legacy.headline.checked ? `${Math.round((legacy.headline.named / legacy.headline.checked) * 100)}%` : "—"}
            className="sm:pl-5"
          />
        </div>
      </div>
    </Card>
  ) : null;

  // ── Full report ───────────────────────────────────────────────────────────
  const details = !hasSnapshot ? (
    <Card>
      <EmptyState
        icon="chat"
        title="Your full report appears after the first check"
        description="A question-by-engine grid, each engine's own numbers, who the answers named instead of you, and the profile signals behind the answers — all from real recorded answers, nothing invented."
      />
    </Card>
  ) : multi ? (
    <div className="space-y-5">
      <MethodCard multi={multi} detected={detected} basis={plan.basis} servicesSource={context.servicesSource} />

      {/* Per-engine cards */}
      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="kicker">By engine</div>
            <h2 className="text-[18px] font-bold text-ink">How each engine answered</h2>
          </div>
          <span className="text-[12px] text-faint">
            <span className="tabular-nums">{multi.summary.enginesConnected}</span> of{" "}
            <span className="tabular-nums">{multi.summary.enginesTotal}</span> connected
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {multi.engines.map((engine) => (
            <EngineCard key={engine.engineId} engine={engine} />
          ))}
        </div>
      </div>

      {/* The grid */}
      <Card>
        <CardHeader
          kicker="Question by engine"
          title="Where you are named, and where you are not"
          action={
            <Badge tone="neutral" icon="grid">
              {multi.queries.length} questions × {multi.summary.enginesTotal} engines
            </Badge>
          }
        />
        <EngineGrid engines={multi.engines} rows={multi.matrix} />
      </Card>

      {/* Share of voice */}
      <ShareOfVoiceCard multi={multi} />

      {/* Per-question detail */}
      <div>
        <div className="mb-3">
          <div className="kicker">Every answer</div>
          <h2 className="text-[18px] font-bold text-ink">What each engine actually said</h2>
        </div>
        <div className="space-y-3">
          {multi.matrix.map((row) => (
            <Card key={row.query}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="kicker mb-0.5">Question asked</div>
                  <div className="text-[15px] font-bold text-ink">&ldquo;{row.query}&rdquo;</div>
                </div>
                {row.checkedOn === 0 ? (
                  <Badge tone="sub" icon="alert" className="shrink-0 px-2 py-1 text-[12px]">
                    Not checked
                  </Badge>
                ) : row.namedOn === row.checkedOn ? (
                  <Badge tone="primary" icon="check-circle" className="shrink-0 px-2 py-1 text-[12px]">
                    Named on all {row.checkedOn}
                  </Badge>
                ) : row.namedOn > 0 ? (
                  <Badge tone="gold" icon="sparkles" className="shrink-0 px-2 py-1 text-[12px]">
                    Named on {row.namedOn} of {row.checkedOn}
                  </Badge>
                ) : (
                  <Badge tone="danger" icon="x" className="shrink-0 px-2 py-1 text-[12px]">
                    Not named on any of {row.checkedOn}
                  </Badge>
                )}
              </div>

              <div className="mt-3 divide-y divide-hairline">
                {multi.engines.map((engine) => (
                  <EngineAnswer key={engine.engineId} engine={engine} query={row.query} />
                ))}
              </div>

              {row.checkedOn > 0 && row.namedOn === 0 ? (
                <div className="mt-3 flex justify-end">
                  <GapToTask query={row.query} />
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      </div>

      <SignalsCard signals={signals} />

      {detected ? (
        <div className="flex items-start gap-2 rounded-card border border-gold/40 bg-gold-tint/50 p-3">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-gold-deep" />
          <p className="text-[12px] text-gold-deep">
            AI answers change often — this is what {answered.length}{" "}
            {answered.length === 1 ? "engine" : "engines"} said on {detected}, not a live guarantee
            and not a ranking you hold. Google&apos;s AI Overviews and ChatGPT&apos;s browsing mode
            have no API and are not represented here.
          </p>
        </div>
      ) : null}
    </div>
  ) : legacy ? (
    <div className="space-y-5">
      <Card className="border-hairline bg-primary-wash/40">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-btn bg-card text-primary">
            <Icon name="eye" size={17} />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-ink">How this was measured</div>
            <p className="mt-1 text-[13px] text-sub">
              {legacy.assistantLabel
                ? `We asked ${legacy.assistantLabel} ${legacy.results.length} ${legacy.results.length === 1 ? "question" : "questions"} on ${detected} and read its own answers for your business name.`
                : `This is a stored snapshot from ${detected}.`}{" "}
              It is one assistant&apos;s answer at one moment. The next check will ask every
              connected engine the same questions and show them side by side.
            </p>
          </div>
        </div>
      </Card>
      <div className="space-y-3">
        {legacy.results.map((result) => (
          <Card key={result.query}>
            <div className="flex items-start justify-between gap-3">
              <div className="text-[15px] font-bold text-ink">&ldquo;{result.query}&rdquo;</div>
              <OutcomeBadge result={result} />
            </div>
            {result.status === "checked" ? (
              <p className="mt-2 text-[13px] italic text-sub">&ldquo;{result.answerExcerpt}&rdquo;</p>
            ) : (
              <p className="mt-2 text-[13px] text-sub">{NOT_CHECKED_COPY[result.reason]}</p>
            )}
          </Card>
        ))}
      </div>
      <SignalsCard signals={signals} />
    </div>
  ) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            AI Visibility
            <Badge tone="gold" icon="sparkles">
              {visibilityPlan.name} and up
            </Badge>
          </span>
        }
        sub={`Whether ChatGPT, Claude, Gemini and Perplexity name ${businessName || "your business"} when people ask — the same questions, put to every engine we can reach.`}
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

// ── Pieces ─────────────────────────────────────────────────────────────────

function NotCheckedNote({ multi }: { multi: AeoMultiRunRecord }) {
  const asked = multi.engines
    .filter((engine) => engine.state === "answered")
    .reduce((total, engine) => total + engine.results.length, 0);
  const notChecked = asked - multi.summary.answersChecked;
  const notConnected = multi.engines.filter((engine) => engine.state === "not_connected");
  if (notChecked === 0 && notConnected.length === 0) return null;
  return (
    <div className="mt-3 space-y-1 border-t border-hairline pt-3 text-[12px] text-faint">
      {notChecked > 0 ? (
        <p className="flex items-start gap-1.5">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
          <span>
            <span className="tabular-nums">{notChecked}</span> further{" "}
            {notChecked === 1 ? "answer was" : "answers were"} asked for but could not be checked,
            so {notChecked === 1 ? "it is" : "they are"} left out of this fraction rather than
            counted against you.
          </span>
        </p>
      ) : null}
      {notConnected.length > 0 ? (
        <p className="flex items-start gap-1.5">
          <Icon name="x" size={13} className="mt-0.5 shrink-0" />
          <span>
            {notConnected.map((engine) => engine.productName).join(", ")}{" "}
            {notConnected.length === 1 ? "was" : "were"} not connected when this ran, so{" "}
            {notConnected.length === 1 ? "it was" : "they were"} never asked. That is not a
            &ldquo;not named&rdquo;.
          </span>
        </p>
      ) : null}
    </div>
  );
}

function MethodCard({
  multi,
  detected,
  basis,
  servicesSource,
}: {
  multi: AeoMultiRunRecord;
  detected: string | null;
  basis: { category: string; city: string; services: string[] };
  servicesSource: keyof typeof SERVICES_SOURCE_COPY;
}) {
  const answered = multi.engines.filter((engine) => engine.state === "answered");
  return (
    <Card className="border-hairline bg-primary-wash/40">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-btn bg-card text-primary">
          <Icon name="eye" size={17} />
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-ink">How this was measured</div>
          <p className="mt-1 text-[13px] text-sub">
            We put the same <span className="tabular-nums">{multi.queries.length}</span> questions, with
            the same prompt, to {answered.length} {answered.length === 1 ? "engine" : "engines"}
            {detected ? ` on ${detected}` : ""} and read each engine&apos;s own answer for your business
            name. The business being measured is never mentioned to any engine. Position is the
            order your name appears among the businesses in that one answer. A rate is only ever
            named-over-checked; an engine that was not connected, or an answer that could not be
            read, is never counted as a miss.
          </p>
          {basis.category ? (
            <p className="mt-2 text-[12px] text-faint">
              Questions were written from your category ({basis.category})
              {basis.city ? `, your city (${basis.city})` : ""} and {SERVICES_SOURCE_COPY[servicesSource]}.
            </p>
          ) : null}
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-hairline pt-3">
            {answered.map((engine) => (
              <div key={engine.engineId}>
                <dt className="kicker">{engine.productName}</dt>
                <dd className="text-[13px] font-semibold tabular-nums text-ink">{engine.model ?? "Model not recorded"}</dd>
              </div>
            ))}
            <div>
              <dt className="kicker">Run date</dt>
              <dd className="text-[13px] font-semibold tabular-nums text-ink">{detected ?? "Not recorded"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </Card>
  );
}

function EngineCard({ engine }: { engine: AeoEngineOutcome }) {
  const grounding = GROUNDING_COPY[engine.grounding];
  if (engine.state === "not_connected") {
    return (
      <Card className="border-dashed">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[15px] font-bold text-ink">{engine.productName}</div>
            <div className="text-[12px] text-faint">{engine.vendor}</div>
          </div>
          <Badge tone="sub" icon="x">Not asked</Badge>
        </div>
        <p className="mt-3 text-[13px] text-sub">
          Not connected on this deployment, so it was never asked. Nothing here is a verdict.
        </p>
        <p className="mt-2 text-[12px] tabular-nums text-faint">{engine.missing}</p>
      </Card>
    );
  }
  const metrics = engine.metrics!;
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-ink">{engine.productName}</div>
          <div className="text-[12px] text-faint">{engine.vendor}</div>
        </div>
        <Badge tone={engine.grounding === "web_search" ? "primary" : "neutral"} icon={grounding.icon}>
          {grounding.label}
        </Badge>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-[28px] font-extrabold leading-none tabular-nums text-ink">{pct(metrics.presenceRate)}</div>
          <div className="mt-1 text-[12px] text-sub">
            named in <span className="tabular-nums">{metrics.named}</span> of{" "}
            <span className="tabular-nums">{metrics.checked}</span> checked
          </div>
        </div>
        <div className="text-right">
          <div className="text-[18px] font-bold tabular-nums text-ink">{position(metrics.averagePosition)}</div>
          <div className="text-[12px] text-sub">avg position</div>
        </div>
      </div>
      <div className="mt-3">
        <ProgressMeter
          value={metrics.named}
          max={Math.max(metrics.checked, 1)}
          label={`${engine.productName} answers naming you`}
          valueText={`${metrics.named} of ${metrics.checked}`}
          showValue={false}
        />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-hairline pt-3 text-[12px]">
        <dt className="text-faint">Best position</dt>
        <dd className="text-right font-semibold tabular-nums text-ink">{position(metrics.bestPosition)}</dd>
        <dt className="text-faint">Could not check</dt>
        <dd className="text-right font-semibold tabular-nums text-ink">{metrics.asked - metrics.checked}</dd>
        <dt className="text-faint">Model</dt>
        <dd className="truncate text-right font-semibold tabular-nums text-ink" title={engine.model ?? undefined}>
          {engine.model ?? "—"}
        </dd>
      </dl>
      <p className="mt-3 text-[12px] text-faint">{readingNoteFor(engine)}</p>
    </Card>
  );
}

function readingNoteFor(engine: AeoEngineOutcome): string {
  return engine.grounding === "web_search"
    ? "Searches the live web before answering, so this is the closest thing here to current findability."
    : "Answers from what the model already knows. Being unnamed here is not evidence about today's web.";
}

function ShareOfVoiceCard({ multi }: { multi: AeoMultiRunRecord }) {
  const shares = multi.shareOfVoice.slice(0, 10);
  const top = shares[0]?.answers ?? 0;
  if (shares.length === 0) return null;
  const youRank = shares.findIndex((share) => share.isYou) + 1;
  return (
    <Card>
      <CardHeader
        kicker="Share of voice"
        title={youRank > 0 ? `You rank #${youRank} of ${multi.shareOfVoice.length} businesses the engines named` : "Who the engines named instead"}
        action={
          <Badge tone="neutral" icon="users">
            {multi.summary.answersChecked} checked answers
          </Badge>
        }
      />
      <ol className="divide-y divide-hairline">
        {shares.map((share, index) => (
          <li key={share.name} className="flex items-center gap-3 py-2.5">
            <span className="w-6 shrink-0 text-right text-[13px] font-bold tabular-nums text-faint">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`truncate text-[14px] font-semibold ${share.isYou ? "text-primary-dark" : "text-ink"}`}>
                  {share.name}
                </span>
                {share.isYou ? <Badge tone="primary">You</Badge> : null}
                <span className="text-[12px] text-faint">
                  {share.engines.map((id) => multi.engines.find((engine) => engine.engineId === id)?.productName ?? id).join(" · ")}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hairline">
                <div
                  className={share.isYou ? "h-full rounded-full bg-primary" : "h-full rounded-full bg-sub/40"}
                  style={{ width: `${top ? Math.max(4, Math.round((share.answers / top) * 100)) : 0}%` }}
                />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[15px] font-bold tabular-nums text-ink">{pct(share.share)}</div>
              <div className="text-[11px] tabular-nums text-faint">
                {share.answers} of {multi.summary.answersChecked}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-hairline pt-3 text-[12px] text-faint">
        Share is the fraction of checked answers, across every engine, that named each business.
        Names are copied from the answers themselves; nothing is inferred about businesses the
        engines did not mention.
      </p>
    </Card>
  );
}

function EngineAnswer({ engine, query }: { engine: AeoEngineOutcome; query: string }) {
  const result = engine.results.find((item) => item.query === query);
  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="w-[120px] shrink-0 pt-0.5">
        <div className="text-[13px] font-semibold text-ink">{engine.productName}</div>
        <div className="text-[11px] text-faint">{GROUNDING_COPY[engine.grounding].label}</div>
      </div>
      <div className="min-w-0 flex-1">
        {engine.state === "not_connected" ? (
          <p className="text-[13px] text-faint">Not asked — {engine.missing}.</p>
        ) : !result ? (
          <p className="text-[13px] text-faint">No answer recorded for this question.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <OutcomeBadge result={result} />
              {isChecked(result) && result.competitorsNamed.length > 0 ? (
                <span className="text-[12px] text-faint">
                  Also named: {result.competitorsNamed.join(", ")}
                </span>
              ) : null}
            </div>
            {isChecked(result) ? (
              <p className="mt-1.5 text-[13px] italic text-sub">&ldquo;{result.answerExcerpt}&rdquo;</p>
            ) : (
              <p className="mt-1.5 text-[13px] text-sub">{NOT_CHECKED_COPY[result.reason]}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function OutcomeBadge({ result }: { result: AeoQueryOutcome }) {
  if (result.status === "not_checked") {
    return (
      <Badge tone="sub" icon="alert">
        Not checked
      </Badge>
    );
  }
  if (result.named) {
    return (
      <Badge tone="primary" icon="check-circle">
        Named{typeof result.position === "number" ? ` · #${result.position}` : ""}
      </Badge>
    );
  }
  return (
    <Badge tone="danger" icon="x">
      Not named
    </Badge>
  );
}

function SignalsCard({ signals }: { signals: ProfileSignal[] }) {
  if (signals.length === 0) return null;
  return (
    <Card>
      <CardHeader kicker="Signals" title="What an engine can read about you" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {signals.map((signal) => (
          <FactorRow key={signal.title} good={signal.good} title={signal.title} detail={signal.detail} />
        ))}
      </div>
      <p className="mt-3 border-t border-hairline pt-3 text-[12px] text-faint">
        Read from your Google profile and this snapshot — no engine publishes its ranking formula,
        so these are the signals we can actually see. None of them is shown here as a cause of
        being named.
      </p>
    </Card>
  );
}

interface ProfileSignal {
  title: string;
  detail: string;
  good: boolean;
}

/**
 * The signal rows, derived entirely from this workspace's own Google profile
 * state and its recorded answers. No vertical-specific copy: every string is
 * assembled from numbers the workspace actually has.
 *
 * These rows describe what an engine can READ. None of them asserts that a
 * signal causes the business to be named — that link is not published by any
 * engine and is not something this product can measure.
 */
function profileSignals(location: Location, answers: AeoCheckedQuery[]): ProfileSignal[] {
  const profile = location.profile;
  const signals: ProfileSignal[] = [];

  signals.push(
    location.reviewCount > 0
      ? {
          good: location.rating >= 4.5,
          title: "Review strength",
          detail: `${location.rating.toFixed(1)}★ across ${location.reviewCount} Google reviews — the rating and volume an engine can quote back.`,
        }
      : {
          good: false,
          title: "No reviews detected",
          detail: "There is no rating or review volume on your profile for an engine to quote.",
        },
  );

  const replyPct = Math.round(profile.responseRate * 100);
  signals.push({
    good: profile.responseRate >= 0.8,
    title: "Review replies",
    detail: `You reply to ${replyPct}% of reviews. Replies add fresh, ownable text about what you do.`,
  });

  signals.push(
    profile.servicesTotal > 0
      ? {
          good: profile.servicesWithDescriptions >= profile.servicesTotal,
          title: "Service descriptions",
          detail: `${profile.servicesWithDescriptions} of ${profile.servicesTotal} listed services carry a description. A service with no description gives an engine no text to read.`,
        }
      : {
          good: false,
          title: "No services listed",
          detail: "Your profile lists no services yet, so question-level matches have nothing to attach to.",
        },
  );

  signals.push({
    good: profile.hoursSet && profile.holidayHoursSet,
    title: profile.hoursSet ? "Opening hours" : "Missing opening hours",
    detail: profile.hoursSet
      ? profile.holidayHoursSet
        ? "Regular and holiday hours are both published, so time-based questions have something to read."
        : "Regular hours are published; holiday hours are not, so date-specific questions have nothing to read."
      : "Hours aren't published, so “open now” style questions have nothing to read.",
  });

  const descriptionWords = profile.description.trim().split(/\s+/).filter(Boolean).length;
  signals.push(
    descriptionWords > 0
      ? {
          good: descriptionWords >= 25,
          title: "Profile description",
          detail: `${descriptionWords} words describing the business. This is the profile text an engine has to work from.`,
        }
      : {
          good: false,
          title: "No profile description",
          detail: "There is no business description on your profile for an engine to read.",
        },
  );

  // Where the answers went instead — from checked answers across every engine.
  const missed = answers.filter((q) => !q.named).length;
  if (answers.length > 0) {
    const tally = new Map<string, number>();
    for (const q of answers) {
      if (q.named) continue;
      for (const name of q.competitorsNamed) tally.set(name, (tally.get(name) ?? 0) + 1);
    }
    const rivals = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    signals.push({
      good: missed === 0,
      title: missed === 0 ? "No missed answers" : "Answers going elsewhere",
      detail:
        missed === 0
          ? `Every one of the ${answers.length} checked answers named you.`
          : `You went unnamed in ${missed} of ${answers.length} checked answers${namedInsteadClause(rivals)}.`,
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
