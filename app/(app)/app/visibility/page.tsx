import { getData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge, EmptyState } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { Icon } from "@/components/icons";
import { formatDate } from "@/lib/utils/format";
import { GapToTask } from "./GapToTask";

export default async function VisibilityPage() {
  const data = await getData();
  const aeo = data.aeo;
  const queries = aeo?.queries ?? [];
  const named = aeo?.namedFraction.named ?? 0;
  const total = aeo?.namedFraction.total ?? 0;
  const detected = aeo ? formatDate(aeo.date) : formatDate(new Date().toISOString());

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

      {/* Summary */}
      <Card raised>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="kicker mb-1">This snapshot</div>
            <div className="text-[20px] font-extrabold text-ink">
              Named in {named} of {total} questions
            </div>
            <p className="mt-1 text-[14px] text-sub">
              You appear in AI answers for {total > 0 ? Math.round((named / total) * 100) : 0}% of the
              buying questions we tested nearby.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="grid size-16 place-items-center rounded-card bg-primary-tint text-primary-dark">
              <span className="text-[22px] font-extrabold tabular-nums">
                {named}/{total}
              </span>
            </div>
          </div>
        </div>
      </Card>

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
                  <div className="text-[11px] uppercase tracking-wide text-faint">Question asked</div>
                  <div className="text-[15px] font-bold text-ink">&ldquo;{q.query}&rdquo;</div>
                </div>
                {q.named ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-chip bg-primary-tint px-2 py-1 text-[12px] font-semibold text-primary-dark">
                    <Icon name="check-circle" size={14} /> Named
                    {typeof q.position === "number" ? ` · #${q.position}` : ""}
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-chip bg-danger-tint px-2 py-1 text-[12px] font-semibold text-danger">
                    <Icon name="x" size={14} /> Not named
                  </span>
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

      {/* Factor panel */}
      <Card>
        <CardHeader title="What drives whether you're named" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FactorRow good title="Strong, recent reviews" detail="4.7★ with fresh reviews makes you a safe recommendation." />
          <FactorRow good title="Clear service descriptions" detail="Direct billing and dry needling are well described — you win those." />
          <FactorRow title="Missing service depth" detail="Concussion / vestibular rehab isn't detailed, so AI names others there." />
          <FactorRow title="Incomplete hours" detail="Saturday hours aren't listed, so 'open Saturday' questions skip you." />
        </div>
      </Card>

      <div className="flex items-start gap-2 rounded-card border border-gold/40 bg-gold-tint/50 p-3">
        <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-gold-deep" />
        <p className="text-[12px] text-gold-deep">
          AI answers change often — this is a detected snapshot from {detected}, not a live guarantee.
        </p>
      </div>
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
