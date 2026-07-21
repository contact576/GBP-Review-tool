import { NextResponse } from "next/server";
import { getRealProvider, isDbBacked } from "@/lib/data";
import { isMonitoringCronAuthorized } from "@/lib/monitoring/cron-auth";
import { runContinuousMonitoringBatch } from "@/lib/monitoring/runner";

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
  const result = await runContinuousMonitoringBatch({
    provider: await getRealProvider(),
    trigger: "scheduled",
  });
  return NextResponse.json({ ok: true, ...result });
}
