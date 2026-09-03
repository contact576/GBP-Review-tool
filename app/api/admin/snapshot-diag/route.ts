import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSql } from "@/lib/db/client";
import { isDbBacked } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Ops-only diagnostic: time every query the platform snapshot runs, one by
 * one, each under its own cap, and report which one stalls on this instance.
 * Exists because the snapshot stalled on Vercel in a way no local run could
 * reproduce (2026-09-04). Reads only; returns JSON; platform_admin only.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "platform_admin" || session.isDemo) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isDbBacked()) return NextResponse.json({ error: "no database" }, { status: 503 });
  const pg = getSql();
  const now = new Date();
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
  const results: Record<string, string> = {};
  let tenantIds: string[] = [];

  async function stage(name: string, run: () => Promise<unknown>, cap = 8000): Promise<unknown> {
    const t0 = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"TIMEOUT">((resolve) => { timer = setTimeout(() => resolve("TIMEOUT"), cap); });
    try {
      const value = await Promise.race([run(), timeout]);
      results[name] = value === "TIMEOUT" ? `TIMEOUT after ${Date.now() - t0}ms` : `${Date.now() - t0}ms`;
      return value === "TIMEOUT" ? undefined : value;
    } catch (error) {
      results[name] = `ERROR after ${Date.now() - t0}ms: ${error instanceof Error ? error.message : String(error)}`;
      return undefined;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const workspaces = (await stage("workspaces", () => pg`
    select w.id as "workspaceId" from workspace w
    join location l on l.workspace_id = w.id
    join subscription s on s.workspace_id = w.id
    where w.is_demo = false
      and not exists (select 1 from app_user pa where pa.workspace_id = w.id and pa.role = 'platform_admin')`)) as { workspaceId: string }[] | undefined;
  tenantIds = workspaces?.map((row) => row.workspaceId) ?? [];
  results.tenantCount = String(tenantIds.length);

  await stage("deliveryFailures", () => pg`
    select workspace_id, channel, status, count(*)::int as count, max(created_at) as latest
    from review_request where status in ('failed','suppressed') and is_test = false and created_at >= ${iso(30)}
    group by 1, 2, 3`);
  await stage("durability", () => pg`
    select workspace_id, count(*)::int as posted from review group by 1`);
  await stage("weekly", () => pg`
    select count(*)::int as count from review r join workspace w on w.id = r.workspace_id
    where w.is_demo = false and r.published_at >= ${iso(7)}`);
  await stage("history", () => pg`select day from platform_snapshot order by day desc limit 400`);
  if (tenantIds.length) {
    await stage("fraudRequests", () => pg`
      select id from review_request
      where workspace_id in ${pg(tenantIds)} and is_test = false
        and (created_at >= ${iso(7)} or status in ('posted_google','opened','clicked','sent','delivered'))`);
    await stage("fraudReviews", () => pg`
      select published_at from review
      where workspace_id in ${pg(tenantIds)} and matched_request_id is not null and published_at >= ${iso(31)}`);
    await stage("fraudCustomers", () => pg`
      select distinct c.workspace_id, c.id, c.name, c.email from customer c
      where c.workspace_id in ${pg(tenantIds)}
        and exists (select 1 from review_request r where r.customer_id = c.id and r.workspace_id = c.workspace_id and r.is_test = false)`);
    await stage("fraudStaff", () => pg`select id from staff_member where workspace_id in ${pg(tenantIds)}`);
    await stage("fraudUsers", () => pg`select email from app_user where workspace_id in ${pg(tenantIds)}`);
    await stage("triage", () => pg`select flag_id from fraud_triage`);
  }
  await stage("fullSnapshot", async () => {
    const { drizzleProvider } = await import("@/lib/data/drizzle-provider");
    return drizzleProvider.getPlatformSnapshot("diag");
  }, 20_000);
  // The shape every admin page used to run: the 21-query workspace load and
  // the snapshot at the same time, on the same pool.
  await stage("workspaceLoadAlone", async () => {
    const { drizzleProvider } = await import("@/lib/data/drizzle-provider");
    return drizzleProvider.getData(session.workspaceId);
  }, 20_000);
  await stage("workspaceLoadAndSnapshotConcurrently", async () => {
    const { drizzleProvider } = await import("@/lib/data/drizzle-provider");
    return Promise.all([drizzleProvider.getData(session.workspaceId), drizzleProvider.getPlatformSnapshot("diag")]);
  }, 20_000);

  return NextResponse.json({ ok: true, instance: process.env.VERCEL_REGION ?? null, results });
}
