"use client";

import { LineArea, type LinePoint } from "@/components/charts";
import { formatShortDate } from "@/lib/utils/format";

/**
 * Client wrapper for the Growth Report's score-movement trend.
 *
 * LineArea takes `formatLabel`/`formatValue` callbacks, and functions cannot
 * cross the server→client boundary — passing them straight from the (server)
 * report page threw "Functions cannot be passed directly to Client Components"
 * and took the whole page down to its error boundary. The formatters live on
 * the client side of the boundary here, matching TrendCard and
 * DashboardTrendCard.
 */
export function ScoreTrendChart({ data }: { data: LinePoint[] }) {
  return (
    <LineArea
      data={data}
      height={200}
      title="Local Growth Score, last 30 days"
      formatLabel={(s) => formatShortDate(s)}
      formatValue={(n) => String(Math.round(n))}
    />
  );
}
