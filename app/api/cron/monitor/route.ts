import { NextResponse } from "next/server";
import { getRealProvider, isDbBacked } from "@/lib/data";
import { isMonitoringCronAuthorized } from "@/lib/monitoring/cron-auth";
import { runContinuousMonitoringBatch } from "@/lib/monitoring/runner";
import { runTrialEmailBatch, type TrialEmailBatchResult } from "@/lib/billing/trial-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isMonitoringCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isDbBacked()) {
    return NextResponse.json({ error: "database_required" }, { status: 503 });
  }
  const provider = await getRealProvider();
  const result = await runContinuousMonitoringBatch({
    provider,
    trigger: "scheduled",
  });

  // Trial notices ride the same daily schedule. They are best-effort: a
  // failure here is logged and reported, never allowed to fail the cron —
  // the monitoring result above has already been earned.
  let trialEmails: TrialEmailBatchResult | { error: string };
  try {
    trialEmails = await runTrialEmailBatch({ provider });
  } catch (error) {
    const message = error instanceof Error ? error.message : "trial email batch failed";
    console.error("[cron/monitor] trial emails failed:", message);
    trialEmails = { error: message.slice(0, 300) };
  }

  return NextResponse.json({ ok: true, ...result, trialEmails });
}
