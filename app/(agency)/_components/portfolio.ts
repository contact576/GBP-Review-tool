import type { AgencyClient } from "@/lib/data/types";

/**
 * Portfolio roll-ups for the agency overview — pure, over the live book.
 * Every figure is a sum or a weighted average of what each client's own
 * workspace reports; nothing here is estimated.
 */

export const REPORT_OVERDUE_DAYS = 14;

/**
 * Is the client's Google listing linked? The live rollup answers directly;
 * a stored book entry with no live fields (seeded fixtures, an unreadable
 * workspace) is taken at its word — a non-zero rating came from a listing.
 */
export function clientLinked(client: Pick<AgencyClient, "googleLinked" | "rating">): boolean {
  return client.googleLinked ?? client.rating > 0;
}

/**
 * The client's Growth Score when one has actually been measured, else null.
 * A live client with no trusted trail scores 0 in the rollup, which is "not
 * measured", not "zero"; a stored entry keeps whatever it last recorded.
 */
export function clientGrowth(client: Pick<AgencyClient, "growthScore" | "trend">): number | null {
  if (client.trend && client.trend.length) return client.growthScore;
  if (client.trend === undefined && client.growthScore > 0) return client.growthScore;
  return null;
}

export interface PortfolioSummary {
  clients: number;
  linked: number;
  connected: number;
  withLogin: number;
  totalReviews: number;
  newReviews30d: number;
  needsReply: number;
  /** Rating averaged across linked clients, weighted by their review counts; null when nothing is linked. */
  weightedRating: number | null;
  /** Average measured Growth Score across clients that have one; null when none is measured. */
  avgGrowth: number | null;
  measuredGrowth: number;
  reportsOverdue: number;
  healthy: number;
  attention: number;
  atRisk: number;
}

export function isReportOverdue(client: Pick<AgencyClient, "lastReportSent">, now: Date = new Date()): boolean {
  if (!client.lastReportSent) return true;
  return now.getTime() - new Date(client.lastReportSent).getTime() > REPORT_OVERDUE_DAYS * 86_400_000;
}

export function summarizePortfolio(clients: AgencyClient[], now: Date = new Date()): PortfolioSummary {
  const linkedClients = clients.filter(clientLinked);
  // Weighted by review count when the counts are known; a plain mean when
  // only ratings are (stored entries), so a fixture never zeroes the average.
  const withCounts = linkedClients.filter((client) => typeof client.reviewCount === "number" && client.reviewCount > 0);
  let weightedRating: number | null = null;
  if (withCounts.length === linkedClients.length && withCounts.length) {
    const weight = withCounts.reduce((sum, client) => sum + (client.reviewCount ?? 0), 0);
    weightedRating = Math.round((withCounts.reduce((sum, client) => sum + client.rating * (client.reviewCount ?? 0), 0) / weight) * 10) / 10;
  } else if (linkedClients.length) {
    weightedRating = Math.round((linkedClients.reduce((sum, client) => sum + client.rating, 0) / linkedClients.length) * 10) / 10;
  }
  const measured = clients.map(clientGrowth).filter((score): score is number => score !== null);
  return {
    clients: clients.length,
    linked: linkedClients.length,
    connected: clients.filter((client) => client.gbpConnected).length,
    withLogin: clients.filter((client) => client.ownerHasLogin).length,
    totalReviews: clients.reduce((sum, client) => sum + (client.reviewCount ?? 0), 0),
    newReviews30d: clients.reduce((sum, client) => sum + client.newReviews30d, 0),
    needsReply: clients.reduce((sum, client) => sum + client.needsReply, 0),
    weightedRating,
    avgGrowth: measured.length ? Math.round(measured.reduce((sum, score) => sum + score, 0) / measured.length) : null,
    measuredGrowth: measured.length,
    reportsOverdue: clients.filter((client) => isReportOverdue(client, now)).length,
    healthy: clients.filter((client) => client.status === "healthy").length,
    attention: clients.filter((client) => client.status === "attention").length,
    atRisk: clients.filter((client) => client.status === "at_risk").length,
  };
}

/** Reviews per month across the whole book (months aligned by the rollup). */
export function portfolioReviewsByMonth(clients: AgencyClient[]): { month: string; count: number }[] {
  const totals = new Map<string, number>();
  const order: string[] = [];
  for (const client of clients) {
    for (const bucket of client.reviewsByMonth ?? []) {
      if (!totals.has(bucket.month)) order.push(bucket.month);
      totals.set(bucket.month, (totals.get(bucket.month) ?? 0) + bucket.count);
    }
  }
  return order.sort().map((month) => ({ month, count: totals.get(month) ?? 0 }));
}

export function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(m) - 1, 1));
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date);
}
