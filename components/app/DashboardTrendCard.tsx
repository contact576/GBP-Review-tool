"use client";

import { Card } from "@/components/ds/Card";
import { LinkButton } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Icon, type IconName } from "@/components/icons";
import { LineArea } from "@/components/charts/LineArea";
import { formatRelative } from "@/lib/utils/format";
import type { DashboardSignal } from "@/lib/data/dashboard";

const STATUS_COPY: Record<
  Exclude<DashboardSignal["status"], "ready" | "stale">,
  { title: string; body: string }
> = {
  needs_google: {
    title: "Connect Google performance",
    body: "Link the Google account that manages this profile to unlock this chart.",
  },
  pending_approval: {
    title: "Performance access is pending",
    body: "Foundly will show the chart after Google access and the performance sync are ready.",
  },
  unavailable: {
    title: "No performance series yet",
    body: "The connection has not returned trustworthy performance history for this metric.",
  },
};

export function DashboardTrendCard({
  signal,
  label,
  kicker,
  description,
  icon,
}: {
  signal: DashboardSignal;
  label: string;
  kicker: string;
  description: string;
  icon: IconName;
}) {
  const available = signal.status === "ready" || signal.status === "stale";
  const series = signal.series.slice(-31).map((point) => ({
    label: point.date,
    value: point.value,
  }));

  return (
    <Card as="section" className="overflow-hidden p-0" aria-label={label}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary">
            <Icon name={icon} size={19} />
          </span>
          <div className="min-w-0">
            <div className="kicker mb-1">{kicker}</div>
            <h3 className="text-[18px] font-bold leading-tight text-ink">{label}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-sub">{description}</p>
          </div>
        </div>
        {signal.status === "stale" ? (
          <Badge tone="gold" icon="clock">Stale</Badge>
        ) : available ? (
          <Badge tone="primary" icon="check-circle">Live source</Badge>
        ) : (
          <Badge tone="sub" icon="lock">Not connected</Badge>
        )}
      </div>

      {available && signal.value !== null ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5">
            <div>
              <div className="font-mono text-[12px] font-semibold text-faint">ROLLING 30 DAYS</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[42px] font-extrabold leading-none tracking-[-0.04em] text-ink tabular-nums">
                  {signal.value.toLocaleString()}
                </span>
                {signal.delta !== null ? (
                  <span className={signal.delta >= 0 ? "data-chip font-semibold text-primary" : "data-chip font-semibold text-danger"}>
                    {signal.delta >= 0 ? "↑" : "↓"} {Math.abs(signal.delta)}%
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-[12px] text-faint">vs the prior 30-day window</div>
            </div>
            <LinkButton href="/app/analytics" variant="ghost" size="sm" iconRight="arrow-right">
              Explore
            </LinkButton>
          </div>

          <div className="mt-3 bg-gradient-to-b from-primary-wash/30 to-transparent px-2 pb-1 pt-2 sm:px-4">
            <LineArea
              data={series}
              height={186}
              title={`${label}, rolling 30-day trend`}
              formatLabel={(value) =>
                new Date(`${value}T00:00:00`).toLocaleString("en", {
                  month: "short",
                  day: "numeric",
                })
              }
              maxLabels={5}
            />
          </div>
        </>
      ) : (
        <div className="mx-5 mb-5 mt-5 overflow-hidden rounded-card border border-hairline bg-primary-wash/35">
          <div className="relative min-h-[218px] p-5">
            <div className="pointer-events-none absolute inset-x-5 bottom-5 top-5 flex flex-col justify-between opacity-70" aria-hidden="true">
              <span className="h-px bg-hairline" />
              <span className="h-px bg-hairline" />
              <span className="h-px bg-hairline" />
              <span className="h-px bg-hairline" />
            </div>
            <div className="relative z-10 flex min-h-[178px] flex-col items-center justify-center text-center">
              <span className="grid size-11 place-items-center rounded-btn border border-hairline bg-card text-primary shadow-sm">
                <Icon name="lock" size={19} />
              </span>
              <h4 className="mt-3 text-[15px] font-bold text-ink">
                {STATUS_COPY[signal.status as keyof typeof STATUS_COPY].title}
              </h4>
              <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-sub">
                {STATUS_COPY[signal.status as keyof typeof STATUS_COPY].body}
              </p>
              <LinkButton href="/app/settings/integrations" size="sm" className="mt-4" icon="google">
                Review Google connection
              </LinkButton>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline bg-paper/50 px-5 py-3 text-[12px] text-faint">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="shield" size={13} /> {signal.source}
        </span>
        {signal.lastSyncAt ? <span>Updated {formatRelative(signal.lastSyncAt)}</span> : <span>No verified sync yet</span>}
      </div>
    </Card>
  );
}
