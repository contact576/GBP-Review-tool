import { NextResponse } from "next/server";
import { getRealProvider, isDbBacked } from "@/lib/data";
import { isMonitoringCronAuthorized } from "@/lib/monitoring/cron-auth";
import { drainDueCampaigns } from "@/lib/campaigns/runner";
import { appUrl } from "@/lib/utils/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled-campaign drain.
 *
 * Registered in vercel.json at "0 17 * * *". Vercel's Hobby plan allows DAILY
 * crons only, so this is a once-a-day sweep, not a minute-accurate scheduler —
 * a campaign scheduled for 3pm goes out on the next daily run. The composer
 * says so rather than implying precision the plan cannot deliver.
 *
 * WHY 17:00 UTC, not 06:00 like the monitor cron: SMS is held outside the
 * recipient's local 8am–9pm window. 06:00 UTC is 1–3am across North America,
 * so every SMS campaign would be held, re-queued, and held again the next day —
 * a silent infinite loop. 17:00 UTC is midday-to-early-evening across the
 * Americas and Europe, inside the window for the businesses this serves.
 *
 * Each campaign it picks up re-checks live consent per recipient before
 * sending, so a customer who opted out between scheduling and drain is skipped
 * even though they are in the frozen snapshot.
 */
export async function GET(request: Request) {
  if (!isMonitoringCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isDbBacked()) {
    return NextResponse.json({ error: "database_required" }, { status: 503 });
  }
  const result = await drainDueCampaigns({
    provider: await getRealProvider(),
    baseUrl: await appUrl(),
  });
  return NextResponse.json({ ok: true, ...result });
}
