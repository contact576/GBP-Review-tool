import { getData } from "@/lib/data";
import { sinceJoined, sparklinePoints } from "@/lib/data/selectors";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge, Delta } from "@/components/ds/misc";
import { Icon, type IconName } from "@/components/icons";
import { Sparkline } from "@/components/charts/Sparkline";
import { MICROCOPY } from "@/lib/compliance/microcopy";
import { formatDate, formatNumber } from "@/lib/utils/format";
import type { MetricSnapshot } from "@/lib/data/types";

interface Section {
  key: keyof MetricSnapshot;
  label: string;
  icon: IconName;
  value: number;
  delta: number;
  blurb: string;
  source: string;
}

export default async function AnalyticsPage() {
  const data = await getData();
  const metrics = data.metrics ?? [];
  const last = metrics[metrics.length - 1];
  const since = sinceJoined(metrics);
  const joined = formatDate(data.location.joinedAt);

  const sections: Section[] = [
    {
      key: "foundYou",
      label: MICROCOPY.foundYouLabel,
      icon: "eye",
      value: last?.foundYou ?? since.foundYou.now,
      delta: since.foundYou.delta,
      blurb: "How many people saw your Business Profile in Google Search and Maps.",
      source: "Google Business Profile insights",
    },
    {
      key: "contactedYou",
      label: MICROCOPY.contactedYouLabel,
      icon: "phone",
      value: last?.contactedYou ?? since.contactedYou.now,
      delta: since.contactedYou.delta,
      blurb: "Calls, direction requests and website taps — a real intent signal.",
      source: "Google Business Profile actions",
    },
    {
      key: "newReviews",
      label: MICROCOPY.newReviewsLabel,
      icon: "star",
      value: since.newReviews.now,
      delta: since.newReviews.delta,
      blurb: "New Google reviews detected in the last 30 days.",
      source: "Google reviews (detected)",
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[24px] font-extrabold text-ink lg:text-[28px]">Analytics</h1>
        <p className="text-[15px] text-sub">
          The three actions that matter — measured honestly, never inflated into &ldquo;customers.&rdquo;
        </p>
      </div>

      <div className="space-y-4">
        {sections.map((s) => (
          <Card key={s.key as string}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-sub">
                <div className="grid size-9 place-items-center rounded-btn bg-primary-wash text-primary">
                  <Icon name={s.icon} size={18} />
                </div>
                <span className="text-[15px] font-semibold text-ink">{s.label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Delta value={s.delta} />
                <span className="text-[12px] text-faint">vs prev. 30 days</span>
              </div>
            </div>

            <div className="mt-3 flex items-end gap-3">
              <span className="text-[38px] font-extrabold leading-none tabular-nums text-ink">
                {formatNumber(s.value)}
              </span>
            </div>
            <p className="mt-1.5 text-[14px] text-sub">{s.blurb}</p>

            <div className="mt-3 overflow-x-auto">
              <Sparkline data={sparklinePoints(metrics, s.key)} width={560} height={72} />
            </div>

            <p className="mt-2 flex items-center gap-1.5 text-[13px] text-faint">
              <Icon name="clock" size={13} />
              {MICROCOPY.sinceJoined} — you joined {joined}
            </p>
          </Card>
        ))}
      </div>

      {/* Sources */}
      <Card>
        <CardHeader title="Sources" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-hairline text-faint">
                <th className="py-2 pr-4 font-medium">Metric</th>
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 font-medium">Window</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {sections.map((s) => (
                <tr key={s.key as string}>
                  <td className="py-2.5 pr-4 font-semibold text-ink">{s.label}</td>
                  <td className="py-2.5 pr-4 text-sub">{s.source}</td>
                  <td className="py-2.5 text-sub">Last 90 days</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-start gap-2 rounded-card border border-hairline bg-primary-wash/40 p-3">
        <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-[13px] text-sub">{MICROCOPY.actionsNotCustomers}</p>
      </div>

      <div className="px-1">
        <Badge tone="neutral" icon="shield">No revenue guesses</Badge>
      </div>
    </div>
  );
}
