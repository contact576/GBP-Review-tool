import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getProviderFor } from "@/lib/data";
import { subscriptionHasFeature } from "@/lib/billing/trial";
import { guardAuthenticatedApi } from "@/lib/security/api";
import { buildAeoContext } from "@/lib/aeo/context";
import { connectedEngineIds, engineAvailability } from "@/lib/aeo/engines";
import { aeoQuota } from "@/lib/aeo/metering";
import { runMultiEngineCheck } from "@/lib/aeo/multi-runner";
import { buildMultiAeoRunAuditEntry, toMultiAeoSnapshot } from "@/lib/aeo/persistence";
import { AEO_DEFAULT_QUERY_COUNT, AEO_MAX_QUERIES_PER_RUN, buildDefaultQueries } from "@/lib/aeo/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Up to 8 questions × 4 engines. Engines run in parallel with each other and
 * each bounds its own concurrency at 3, so wall time is roughly one engine's.
 */
export const maxDuration = 60;

/**
 * The question set this workspace would be asked, recomputed now, plus which
 * engines are connected to ask it.
 *
 * Read-only and free: it runs the same `buildAeoContext` + `buildDefaultQueries`
 * the POST does, asks no model and spends no quota. It exists so the list on
 * screen can be refreshed from the server immediately before a run, instead of
 * a preview rendered minutes earlier standing in for what will actually be
 * asked. It is still only a preview — the POST response is the authority on
 * what was asked, because only the POST asked it.
 */
export async function GET(req: Request) {
  const guard = await guardAuthenticatedApi(req, {
    scope: "aeo-plan",
    roles: ["owner", "manager"],
    limit: 20,
    windowMs: 60_000,
  });
  if (!guard.ok) return guard.response;
  const session = guard.session;

  const provider = await getProviderFor(session);
  const data = await provider.getData(session.workspaceId);
  if (!data) return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });

  if (!subscriptionHasFeature(data.subscription, "ai_visibility")) {
    return NextResponse.json({ error: "upgrade_required" }, { status: 403 });
  }

  const plan = buildDefaultQueries(buildAeoContext(data), AEO_DEFAULT_QUERY_COUNT);
  return NextResponse.json({
    ok: true,
    queries: plan.queries.slice(0, AEO_MAX_QUERIES_PER_RUN),
    blockers: plan.blockers,
    quota: aeoQuota(data.auditLog, data.subscription.tier),
    engines: engineAvailability().map((entry) => ({
      id: entry.id,
      productName: entry.descriptor.productName,
      connected: entry.connected,
      model: entry.connected ? entry.model : null,
      missing: entry.missing,
    })),
  });
}

/**
 * The server entry point for "run an AI-Visibility check".
 *
 * Deliberately a route handler rather than a server action: lib/actions.ts is
 * owned elsewhere, and this is a long-running, metered, money-spending call
 * that benefits from explicit HTTP status codes the client can act on.
 *
 * Gates, in order: session + role, short-window abuse guard, the
 * `ai_visibility` entitlement, demo workspace, at least one connected engine,
 * durable monthly quota, then the run across every connected engine.
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

  if (!subscriptionHasFeature(data.subscription, "ai_visibility")) {
    return NextResponse.json({ error: "upgrade_required" }, { status: 403 });
  }

  // The demo workspace ships a seeded snapshot on purpose; letting an
  // unauthenticated-feeling shared demo spend API credits is not metering.
  if (session.isDemo) {
    return NextResponse.json({ error: "demo_workspace" }, { status: 403 });
  }

  // No engine connected means every question on every engine would come back
  // "not checked". That is a real, honest outcome — but writing it would
  // overwrite the stored snapshot with a run that learned nothing, and spend a
  // quota slot doing it. Refuse instead; the UI already disables the button.
  if (connectedEngineIds().length === 0) {
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

  const multi = await runMultiEngineCheck({
    context,
    queries,
    runId: `aeo_${randomBytes(12).toString("hex")}`,
  });

  // Two writes, in this order and for different reasons.
  //
  // 1. The audit row is the run EVENT — who ran it, when, which engines
  //    answered — and it is what the monthly quota is counted from. It goes
  //    first so a run that happened is always metered, even if step 2 fails.
  //    Over-metering a failed save is the safe direction; under-metering is not.
  let metered = true;
  try {
    await provider.appendAuditLog(
      session.workspaceId,
      buildMultiAeoRunAuditEntry({
        id: `audit_${randomBytes(12).toString("hex")}`,
        workspaceId: session.workspaceId,
        actor: session.name,
        multi,
      }),
    );
  } catch {
    metered = false;
  }

  // 2. The results themselves, into `dataset_meta.aeo` via the real provider
  //    method. Every engine's slice is stored, connected or not — see
  //    lib/aeo/persistence.ts.
  let persisted = true;
  try {
    await provider.saveAeoSnapshot(session.workspaceId, toMultiAeoSnapshot(multi, context.locationId));
  } catch {
    persisted = false;
  }

  // `asked` is the exact array handed to the runner, not a re-derivation. The
  // client renders it as the question set of record, so a preview computed on
  // an older render can never be mistaken for what this run actually asked.
  return NextResponse.json({
    ok: true,
    persisted,
    asked: queries,
    run: {
      summary: multi.summary,
      engines: multi.engines.map((engine) => ({
        id: engine.engineId,
        productName: engine.productName,
        state: engine.state,
        model: engine.model,
        checked: engine.metrics?.checked ?? 0,
        named: engine.metrics?.named ?? 0,
        notChecked: engine.metrics ? engine.metrics.asked - engine.metrics.checked : 0,
      })),
    },
    quota: metered
      ? { ...quota, used: quota.used + 1, remaining: Math.max(0, quota.remaining - 1) }
      : quota,
    blockers: plan.blockers,
  });
}
