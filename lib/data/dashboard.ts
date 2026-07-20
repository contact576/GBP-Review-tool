import type { FoundlyData, MetricSnapshot, MetricSource } from "./types";
import { currentScore, sinceJoined } from "./selectors";

export type DashboardSignalStatus =
  | "ready"
  | "stale"
  | "needs_google"
  | "pending_approval"
  | "unavailable";

export interface DashboardSignal {
  key: "foundYou" | "contactedYou" | "newReviews";
  value: number | null;
  delta: number | null;
  series: { date: string; value: number | null }[];
  status: DashboardSignalStatus;
  source: string;
  lastSyncAt?: string;
}

export interface DashboardScore {
  value: number | null;
  reviews: number | null;
  profile: number | null;
  delta: number | null;
  status: DashboardSignalStatus;
  source: string;
  lastSyncAt?: string;
}

export interface DashboardModel {
  score: DashboardScore;
  foundYou: DashboardSignal;
  contactedYou: DashboardSignal;
  newReviews: DashboardSignal;
}

const SOURCE_LABEL: Record<MetricSource, string> = {
  demo: "Sample workspace data",
  google_places: "Google public listing",
  gbp_reviews: "Google Business Profile reviews",
  gbp_performance: "Google Business Profile performance",
  foundly_requests: "Foundly request activity",
};

function sourceLabel(source: MetricSource | undefined): string {
  return source ? SOURCE_LABEL[source] : "Not connected";
}

function lastSourceSync(data: FoundlyData, key: "activity" | "score"): string | undefined {
  const providers =
    key === "activity"
      ? data.integrations.filter((item) => item.provider === "google")
      : data.integrations.filter(
          (item) => item.provider === "google" || item.provider === "google_places",
        );
  return providers
    .map((item) => item.lastSyncAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .pop();
}

function isStale(lastSyncAt: string | undefined, now: Date): boolean {
  if (!lastSyncAt) return false;
  const sync = new Date(lastSyncAt).getTime();
  return Number.isFinite(sync) && now.getTime() - sync > 48 * 60 * 60 * 1_000;
}

function missingStatus(data: FoundlyData): DashboardSignalStatus {
  if (!data.location.googlePlaceId) return "needs_google";
  const google = data.integrations.find((item) => item.provider === "google");
  if (!google || google.status === "disconnected") return "needs_google";
  if (google?.status === "pending" || google?.status === "needs_attention") {
    return "pending_approval";
  }
  return "unavailable";
}

function latest(metrics: MetricSnapshot[]): MetricSnapshot | undefined {
  return [...metrics].sort((a, b) => a.date.localeCompare(b.date)).pop();
}

function buildSignal(
  data: FoundlyData,
  key: DashboardSignal["key"],
  now: Date,
): DashboardSignal {
  const sourced = [...data.metrics]
    .filter((metric) => data.workspace.isDemo || Boolean(metric.sources?.[key]))
    .sort((a, b) => a.date.localeCompare(b.date));
  const point = latest(sourced);
  const comparison = sinceJoined(sourced)[key];
  const source = data.workspace.isDemo ? "demo" : point?.sources?.[key];
  const syncAt = lastSourceSync(data, "activity");
  const status: DashboardSignalStatus = source
    ? isStale(syncAt, now) && source !== "demo"
      ? "stale"
      : "ready"
    : missingStatus(data);

  return {
    key,
    value: source ? comparison.now : null,
    delta: source ? comparison.delta : null,
    series: sourced.map((metric) => ({ date: metric.date, value: metric[key] })),
    status,
    source: sourceLabel(source),
    lastSyncAt: syncAt,
  };
}

export function buildDashboardModel(data: FoundlyData, now = new Date()): DashboardModel {
  const scoreMetrics = [...data.metrics]
    .filter((metric) => data.workspace.isDemo || Boolean(metric.sources?.scores))
    .sort((a, b) => a.date.localeCompare(b.date));
  const point = latest(scoreMetrics);
  const scoreSource = data.workspace.isDemo ? "demo" : point?.sources?.scores;
  const scoreValues = currentScore(scoreMetrics);
  const scoreSyncAt = lastSourceSync(data, "score");
  const scoreStatus: DashboardSignalStatus = scoreSource
    ? isStale(scoreSyncAt, now) && scoreSource !== "demo"
      ? "stale"
      : "ready"
    : missingStatus(data);

  return {
    score: {
      value: scoreSource ? scoreValues.growth : null,
      reviews: scoreSource ? scoreValues.reviews : null,
      profile: scoreSource ? scoreValues.profile : null,
      delta: scoreSource ? scoreValues.delta : null,
      status: scoreStatus,
      source: sourceLabel(scoreSource),
      lastSyncAt: scoreSyncAt,
    },
    foundYou: buildSignal(data, "foundYou", now),
    contactedYou: buildSignal(data, "contactedYou", now),
    newReviews: buildSignal(data, "newReviews", now),
  };
}
