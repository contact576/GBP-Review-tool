import "server-only";
import { randomBytes } from "node:crypto";
import type { DataProvider } from "@/lib/data/provider";
import type { MonitoringRun, Review } from "@/lib/data/types";

interface DurabilityDelta {
  vanished: Review[];
  atRisk: Review[];
  detected: Review[];
}

/**
 * Compare the review set before and after a sync.
 *
 * This is the observable output of the Durability Watchdog: the sync itself
 * writes the flags, and this turns the change into something the owner is
 * actually told about. Only TRANSITIONS count — a review that was already
 * vanished before this run is not re-reported, so a business is alerted once
 * per disappearance rather than every single day.
 */
export function durabilityDelta(before: Review[], after: Review[]): DurabilityDelta {
  const priorById = new Map(before.map((review) => [review.id, review]));
  const delta: DurabilityDelta = { vanished: [], atRisk: [], detected: [] };
  for (const review of after) {
    const prior = priorById.get(review.id);
    if (review.durability === "vanished" && prior?.durability !== "vanished") {
      delta.vanished.push(review);
    }
    if (review.durability === "at_risk" && prior?.durability !== "at_risk") {
      delta.atRisk.push(review);
    }
    if (review.matchedRequestId && review.matchedRequestId !== prior?.matchedRequestId) {
      delta.detected.push(review);
    }
  }
  return delta;
}

export interface MonitoringWorkspaceResult {
  workspaceId: string;
  status: MonitoringRun["status"] | "duplicate";
  newSuggestions: number;
  error?: string;
}

export function monitoringWindowKey(now: Date): string {
  if (Number.isNaN(now.getTime())) throw new Error("Monitoring requires a valid timestamp.");
  return now.toISOString().slice(0, 10);
}

export async function runWorkspaceMonitoring(input: {
  provider: DataProvider;
  workspaceId: string;
  now: Date;
  trigger: MonitoringRun["trigger"];
}): Promise<MonitoringWorkspaceResult> {
  const { provider, workspaceId, now, trigger } = input;
  const windowKey = monitoringWindowKey(now);
  const startedAt = now.toISOString();
  const proposed: MonitoringRun = {
    id: `monitor_${randomBytes(12).toString("hex")}`,
    workspaceId,
    windowKey,
    trigger,
    status: "running",
    attempts: 1,
    startedAt,
    updatedAt: startedAt,
  };
  const created = await provider.createMonitoringRun(workspaceId, proposed);
  let run = created.run;
  if (!created.created) {
    if (run.status !== "failed") {
      return { workspaceId, status: "duplicate", newSuggestions: 0 };
    }
    run = (await provider.updateMonitoringRun(workspaceId, run.id, {
      status: "running",
      attempts: run.attempts + 1,
      updatedAt: startedAt,
      lastError: undefined,
    })) ?? run;
  }

  try {
    const before = await provider.getData(workspaceId);
    if (!before || before.workspace.isDemo) {
      const completedAt = new Date().toISOString();
      await provider.updateMonitoringRun(workspaceId, run.id, {
        status: "skipped",
        summary: { reason: before ? "demo_workspace" : "workspace_missing" },
        completedAt,
        updatedAt: completedAt,
      });
      return { workspaceId, status: "skipped", newSuggestions: 0 };
    }
    const beforeIds = new Set((before.location.suggestionInbox ?? []).map((suggestion) => suggestion.id));
    const beforeReviews = before.reviews;
    const sync = await provider.syncGoogleProfile(workspaceId);
    const completedAt = new Date().toISOString();
    if (!sync.ok) {
      const message = sync.error ?? "Google monitoring sync failed.";
      await provider.updateMonitoringRun(workspaceId, run.id, {
        status: "failed",
        completedAt,
        updatedAt: completedAt,
        lastError: message.slice(0, 300),
      });
      await provider.appendAuditLog(workspaceId, {
        id: `audit_${randomBytes(12).toString("hex")}`,
        workspaceId,
        actor: "Foundly monitor",
        action: "monitoring.sync_failed",
        targetType: "monitoring_run",
        targetId: run.id,
        at: completedAt,
        meta: { error: message.slice(0, 180) },
      });
      return { workspaceId, status: "failed", newSuggestions: 0, error: message };
    }
    if (sync.pendingApproval) {
      await provider.updateMonitoringRun(workspaceId, run.id, {
        status: "skipped",
        summary: { reason: "google_api_approval_pending" },
        completedAt,
        updatedAt: completedAt,
      });
      return { workspaceId, status: "skipped", newSuggestions: 0 };
    }

    const after = await provider.getData(workspaceId);
    const suggestions = after?.location.suggestionInbox ?? [];
    const newSuggestionIds = suggestions.filter((suggestion) => !beforeIds.has(suggestion.id)).map((suggestion) => suggestion.id);
    const warnings = sync.warnings?.length ?? 0;
    const status: MonitoringRun["status"] = warnings ? "partial" : "completed";
    // The durability ledger only accumulates if every run records what changed.
    const delta = durabilityDelta(beforeReviews, after?.reviews ?? beforeReviews);
    const summary: MonitoringRun["summary"] = {
      rating: sync.rating ?? after?.location.rating ?? 0,
      reviewCount: sync.reviewCount ?? after?.location.reviewCount ?? 0,
      capabilityScore: sync.capabilityScore ?? after?.location.gbpSnapshot?.capabilityScore.score ?? 0,
      openFindings: sync.auditFindings ?? after?.location.gbpAudit?.summary.openFindings ?? 0,
      suggestions: suggestions.length,
      newSuggestionIds,
      warnings,
      reviewsVanished: delta.vanished.length,
      reviewsAtRisk: delta.atRisk.length,
      reviewsDetected: delta.detected.length,
      vanishedReviewIds: delta.vanished.map((review) => review.id),
    };
    await provider.updateMonitoringRun(workspaceId, run.id, {
      status,
      summary,
      completedAt,
      updatedAt: completedAt,
    });
    await provider.appendAuditLog(workspaceId, {
      id: `audit_${randomBytes(12).toString("hex")}`,
      workspaceId,
      actor: "Foundly monitor",
      action: "monitoring.sync_completed",
      targetType: "monitoring_run",
      targetId: run.id,
      at: completedAt,
      meta: {
        newSuggestions: newSuggestionIds.length,
        openFindings: Number(summary.openFindings),
        warnings,
        reviewsVanished: delta.vanished.length,
      },
    });
    if (after && delta.vanished.length) {
      const count = delta.vanished.length;
      const first = delta.vanished[0];
      await provider.appendNotification(workspaceId, {
        id: `ntf_${randomBytes(12).toString("hex")}`,
        locationId: after.location.id,
        kind: "review",
        title: `${count} review${count === 1 ? "" : "s"} no longer showing on Google`,
        body:
          count === 1 && first
            ? `The review from ${first.author} was in your last import and is missing from today's. Google filters reviews without notice — this is what we observed, not a diagnosis of why.`
            : `${count} reviews were in your last import and are missing from today's. Google filters reviews without notice — this is what we observed, not a diagnosis of why.`,
        createdAt: completedAt,
        read: false,
      });
    }
    if (after && newSuggestionIds.length) {
      await provider.appendNotification(workspaceId, {
        id: `ntf_${randomBytes(12).toString("hex")}`,
        locationId: after.location.id,
        kind: "system",
        title: `${newSuggestionIds.length} new local growth suggestion${newSuggestionIds.length === 1 ? "" : "s"}`,
        body: "Foundly detected new evidence-backed opportunities. Review the exact recommendation before approving any Google change.",
        createdAt: completedAt,
        read: false,
      });
    }
    return { workspaceId, status, newSuggestions: newSuggestionIds.length };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Monitoring failed unexpectedly.";
    await provider.updateMonitoringRun(workspaceId, run.id, {
      status: "failed",
      completedAt,
      updatedAt: completedAt,
      lastError: message.slice(0, 300),
    });
    return { workspaceId, status: "failed", newSuggestions: 0, error: message };
  }
}

export async function runContinuousMonitoringBatch(input: {
  provider: DataProvider;
  now?: Date;
  trigger?: MonitoringRun["trigger"];
  batchSize?: number;
}): Promise<{
  windowKey: string;
  connected: number;
  processed: number;
  remaining: number;
  results: MonitoringWorkspaceResult[];
}> {
  const now = input.now ?? new Date();
  const windowKey = monitoringWindowKey(now);
  const workspaceIds = await input.provider.listGoogleConnectedWorkspaceIds();
  const pending: string[] = [];
  for (const workspaceId of workspaceIds) {
    const run = await input.provider.getMonitoringRunByWindow(workspaceId, windowKey);
    if (!run || run.status === "failed") pending.push(workspaceId);
  }
  const configuredBatchSize = Number(process.env.MONITORING_BATCH_SIZE) || 15;
  const batchSize = Math.max(1, Math.min(50, input.batchSize ?? configuredBatchSize));
  const selected = pending.slice(0, batchSize);
  const results: MonitoringWorkspaceResult[] = [];
  for (let index = 0; index < selected.length; index += 3) {
    const group = selected.slice(index, index + 3);
    results.push(...await Promise.all(group.map((workspaceId) => runWorkspaceMonitoring({
      provider: input.provider,
      workspaceId,
      now,
      trigger: input.trigger ?? "scheduled",
    }))));
  }
  return {
    windowKey,
    connected: workspaceIds.length,
    processed: results.length,
    remaining: Math.max(0, pending.length - selected.length),
    results,
  };
}
