import { getData } from "@/lib/data";
import { sinceJoined } from "@/lib/data/selectors";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge, Delta } from "@/components/ds/misc";
import { Icon, type IconName } from "@/components/icons";
import { SubDial } from "@/components/charts/SubDial";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { ReportActions } from "./ReportActions";

export default async function ReportPage() {
  const data = await getData();
  const report = (data.reports ?? [])[0];
  const metrics = data.metrics ?? [];
  const last = metrics[metrics.length - 1];
  const startIdx = Math.max(0, metrics.length - 31);
  const start = metrics[startIdx];
  const since = sinceJoined(metrics);

  const scoreStart = start?.growthScore ?? 0;
  const scoreEnd = last?.growthScore ?? 0;

  const reviews = data.reviews ?? [];
  const recent = [...reviews].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  const bestNew = recent.find((r) => r.rating === 5) ?? recent[0];
  const repliesPosted = reviews.filter((r) => r.reply).length;

  const stats: { label: string; icon: IconName; value: number; delta: number }[] = [
    { label: MICROCOPY.foundYouLabel, icon: "eye", value: last?.foundYou ?? since.foundYou.now, delta: since.foundYou.delta },
    { label: MICROCOPY.contactedYouLabel, icon: "phone", value: last?.contactedYou ?? since.contactedYou.now, delta: since.contactedYou.delta },
    { label: MICROCOPY.newReviewsLabel, icon: "star", value: since.newReviews.now, delta: since.newReviews.delta },
  ];

  const foundleyDid = [
    `Sent ${data.subscription.usage.requestsSent} review requests on your behalf`,
    `Drafted ${data.subscription.usage.aiDraftsUsed} AI review & reply starting points`,
    `Detected ${data.subscription.usage.reviewsCaptured} new reviews and matched them to visits`,
    `Kept ${repliesPosted} public replies posted for you`,
  ];

  const nextTasks = (data.tasks ?? []).slice(0, 3);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold text-ink lg:text-[28px]">Growth Report</h1>
          <p className="text-[15px] text-sub">
            {report ? report.period : "Last 30 days"} · generated {report ? formatDate(report.generatedAt) : formatDate(new Date().toISOString())}
          </p>
        </div>
      </div>

      {/* Headline */}
      <Card raised as="section">
        <div className="mb-1 text-[13px] font-bold text-sub">Headline</div>
        <h2 className="text-[24px] font-extrabold leading-tight text-ink">
          {report?.headline ?? "Your month at a glance"}
        </h2>
        <div className="mt-4">
          <ReportActions
            initialNarrative={report?.narrative ?? "A steady month of growth across the numbers that matter."}
            business={data.location.name}
            foundYou={since.foundYou.now}
            foundDelta={since.foundYou.delta}
            contactedYou={since.contactedYou.now}
            newReviews={since.newReviews.now}
          />
        </div>
      </Card>

      {/* Action stats */}
      <section>
        <div className="mb-2 text-[16px] font-bold text-ink">The three numbers that matter</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-card border border-hairline bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sub">
                <Icon name={s.icon} size={16} />
                <span className="text-[13px] font-medium">{s.label}</span>
              </div>
              <div className="mt-2 text-[30px] font-extrabold leading-none tabular-nums text-ink">
                {formatNumber(s.value)}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <Delta value={s.delta} />
                <span className="text-[12px] text-faint">vs prev. 30 days</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-faint">{MICROCOPY.actionsNotCustomers}</p>
      </section>

      {/* Score movement */}
      <Card>
        <CardHeader title="Where your score moved" />
        <div className="flex items-center justify-center gap-6 sm:gap-10">
          <SubDial value={scoreStart} label="30 days ago" />
          <Icon name="arrow-right" size={24} className="text-faint" />
          <SubDial value={scoreEnd} label="Today" />
          <div className="hidden sm:block">
            <Delta value={scoreEnd - scoreStart} suffix=" pts" />
          </div>
        </div>
        <div className="mt-3 text-center sm:hidden">
          <Delta value={scoreEnd - scoreStart} suffix=" pts" />
        </div>
      </Card>

      {/* Review highlights */}
      <Card>
        <CardHeader title="Review highlights" />
        <div className="grid grid-cols-3 gap-3">
          <Highlight value={since.newReviews.now} label="new reviews" icon="star" />
          <Highlight value={repliesPosted} label="replies posted" icon="chat" />
          <Highlight value={data.location.reviewCount} label="total reviews" icon="google" />
        </div>
        {bestNew ? (
          <figure className="mt-4 rounded-card border border-hairline bg-primary-wash/40 p-4">
            <div className="mb-1 flex items-center gap-1">
              {Array.from({ length: bestNew.rating }).map((_, i) => (
                <Icon key={i} name="star-fill" size={14} className="text-star" />
              ))}
            </div>
            <blockquote className="text-[15px] italic text-ink/90">&ldquo;{bestNew.text}&rdquo;</blockquote>
            <figcaption className="mt-2 text-[12px] font-semibold text-sub">— {bestNew.author}</figcaption>
          </figure>
        ) : null}
      </Card>

      {/* What Foundly did / next tasks */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="What Foundly did" />
          <ul className="space-y-2.5">
            {foundleyDid.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[14px] text-ink/90">
                <Icon name="check" size={16} className="mt-0.5 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Your 3 tasks" />
          {nextTasks.length ? (
            <ol className="space-y-2.5">
              {nextTasks.map((t, i) => (
                <li key={t.id} className="flex items-start gap-2.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-tint text-[12px] font-bold text-primary-dark">
                    {i + 1}
                  </span>
                  <div>
                    <div className="text-[14px] font-semibold text-ink">{t.title}</div>
                    <p className="text-[13px] text-sub">{t.rationale}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-4 text-center text-[14px] text-faint">No tasks queued — you&apos;re all caught up.</p>
          )}
        </Card>
      </div>

      <div className="px-1 print:hidden">
        <Badge tone="neutral" icon="shield">Every figure here traces to a real action or detected review.</Badge>
      </div>
    </div>
  );
}

function Highlight({ value, label, icon }: { value: number; label: string; icon: IconName }) {
  return (
    <div className="rounded-card border border-hairline bg-card p-3 text-center">
      <Icon name={icon} size={16} className="mx-auto text-primary" />
      <div className="mt-1 text-[22px] font-extrabold leading-none tabular-nums text-ink">{formatNumber(value)}</div>
      <div className="mt-0.5 text-[12px] text-faint">{label}</div>
    </div>
  );
}
