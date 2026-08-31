import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getProviderFor } from "@/lib/data";
import { hasFeature } from "@/lib/billing/plans";
import { guardAuthenticatedApi } from "@/lib/security/api";
import { buildAeoContext } from "@/lib/aeo/context";
import { aeoQuota } from "@/lib/aeo/metering";
import { getAeoModelClient } from "@/lib/aeo/model-client";
import { buildAeoRunAuditEntry, toAeoSnapshot } from "@/lib/aeo/persistence";
import { AEO_DEFAULT_QUERY_COUNT, AEO_MAX_QUERIES_PER_RUN, buildDefaultQueries } from "@/lib/aeo/queries";
import { runAeoCheck } from "@/lib/aeo/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Up to 8 model calls at concurrency 3 — three short batches. */
export const maxDuration = 60;

/**
 * The server entry point for "run an AI-Visibility check".
 *
 * Deliberately a route handler rather than a server action: lib/actions.ts is
 * owned elsewhere, and this is a long-running, metered, money-spending call
 * that benefits from explicit HTTP status codes the client can act on.
 *
 * Gates, in order: session + role, short-window abuse guard, Pro entitlement,
 * demo workspace, a configured provider, durable monthly quota, then the run.
 */
export async function POST(req: Request) {
  const guard = await guardAuthenticatedApi(req, {
    scope: "aeo-run",
    roles: ["owner", "manager"],
    // These calls cost money — three attempts a minute, then back off.
    limit: 3,
    windowMs: 60_000,
  });
  if (!guard.ok) return guard.response;
  const session = guard.session;

  const provider = await getProviderFor(session);
  const data = await provider.getData(session.workspaceId);
  if (!data) return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });

  if (!hasFeature(data.subscription.tier, "ai_visibility", data.subscription.status === "trialing")) {
    return NextResponse.json({ error: "upgrade_required" }, { status: 403 });
  }

  // The demo workspace ships a seeded snapshot on purpose; letting an
  // unauthenticated-feeling shared demo spend API credits is not metering.
  if (session.isDemo) {
    return NextResponse.json({ error: "demo_workspace" }, { status: 403 });
  }

  // No provider configured means every question would come back "not checked".
  // That is a real, honest outcome — but writing it would overwrite the stored
  // snapshot with a run that learned nothing, and spend a quota slot doing it.
  // Refuse instead; the UI already disables the button in this state.
  const client = getAeoModelClient();
  if (!client) {
    return NextResponse.json({ error: "provider_unavailable" }, { status: 503 });
  }

  // Durable monthly ceiling, counted from this workspace's own audit log so a
  // restart or a second tab cannot reset it. It is check-then-write rather than
  // atomic: two simultaneous requests could both pass, and a run whose audit
  // write fails is not counted. The 3-per-minute guard above bounds both cases.
  const quota = aeoQuota(data.auditLog, data.subscription.tier);
  if (quota.remaining <= 0) {
    return NextResponse.json({ error: "quota_exceeded", quota }, { status: 429 });
  }

  // The query set is derived server-side from the workspace's own profile. The
  // client cannot supply prompt text: it has no product need to, and accepting
  // free text here would turn a metered visibility check into an open relay to
  // the model.
  const context = buildAeoContext(data);
  const plan = buildDefaultQueries(context, AEO_DEFAULT_QUERY_COUNT);
  const queries = plan.queries.slice(0, AEO_MAX_QUERIES_PER_RUN);

  if (queries.length === 0) {
    return NextResponse.json({ error: "no_queries", blockers: plan.blockers }, { status: 422 });
  }

  const record = await runAeoCheck({
    context,
    queries,
    client,
    runId: `aeo_${randomBytes(12).toString("hex")}`,
  });

  // Two writes, in this order and for different reasons.
  //
  // 1. The audit row is the run EVENT — who ran it, when, against which model —
  //    and it is what the monthly quota is counted from. It goes first so a run
  //    that happened is always metered, even if step 2 fails. Over-metering a
  //    failed save is the safe direction; under-metering is not.
  let metered = true;
  try {
    await provider.appendAuditLog(session.workspaceId, buildAeoRunAuditEntry({
      id: `audit_${randomBytes(12).toString("hex")}`,
      workspaceId: session.workspaceId,
      actor: session.name,
      record,
    }));
  } catch {
    metered = false;
  }

  // 2. The results themselves, into `dataset_meta.aeo` via the real provider
  //    method. `toAeoSnapshot` carries the checked/not-checked distinction
  //    across intact — see lib/aeo/persistence.ts.
  let persisted = true;
  try {
    await provider.saveAeoSnapshot(session.workspaceId, toAeoSnapshot(record, context.locationId));
  } catch {
    persisted = false;
  }

  return NextResponse.json({
    ok: true,
    persisted,
    run: record,
    quota: metered
      ? { ...quota, used: quota.used + 1, remaining: Math.max(0, quota.remaining - 1) }
      : quota,
    blockers: plan.blockers,
  });
}
