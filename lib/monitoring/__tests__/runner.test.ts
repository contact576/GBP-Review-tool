import { describe, expect, it } from "vitest";
import type { DataProvider } from "@/lib/data/provider";
import type { MonitoringRun, Notification, ProfileSuggestion } from "@/lib/data/types";
import { buildSeed } from "@/lib/data/seed";
import { isMonitoringCronAuthorized } from "../cron-auth";
import { monitoringWindowKey, runWorkspaceMonitoring } from "../runner";

describe("continuous monitoring safety", () => {
  it("uses stable UTC day windows and constant-time bearer authentication", () => {
    expect(monitoringWindowKey(new Date("2026-07-20T23:59:59.000Z"))).toBe("2026-07-20");
    const secret = "a-secure-cron-secret-that-is-long-enough";
    expect(isMonitoringCronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(isMonitoringCronAuthorized("Bearer wrong", secret)).toBe(false);
    expect(isMonitoringCronAuthorized(`Bearer ${secret}`, "short")).toBe(false);
  });

  it("runs one read-only sync per window and notifies only for a new suggestion", async () => {
    const data = buildSeed();
    data.workspace.isDemo = false;
    data.location.suggestionInbox = [];
    const runs = new Map<string, MonitoringRun>();
    const notifications: Notification[] = [];
    let syncCalls = 0;
    const suggestion: ProfileSuggestion = {
      id: "suggestion_new", workspaceId: data.workspace.id, locationId: data.location.id, auditId: "audit_1", findingId: "finding_1",
      target: "local_post", kind: "local_post", title: "New post", rationale: "Fresh evidence", priorityScore: 90, risk: "low",
      status: "needs_generation", exactPreviewReady: false, evidenceIds: ["e1"], blockers: ["Generate"], nextStep: "Generate",
      createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:00:00.000Z",
    };
    const provider = {
      async getData() { return data; },
      async createMonitoringRun(_workspaceId: string, run: MonitoringRun) {
        const existing = runs.get(run.windowKey);
        if (existing) return { run: existing, created: false };
        runs.set(run.windowKey, run);
        return { run, created: true };
      },
      async updateMonitoringRun(_workspaceId: string, runId: string, patch: Partial<MonitoringRun>) {
        const run = [...runs.values()].find((item) => item.id === runId);
        if (!run) return null;
        Object.assign(run, patch);
        return run;
      },
      async syncGoogleProfile() {
        syncCalls += 1;
        data.location.suggestionInbox = [suggestion];
        return { ok: true, rating: 4.8, reviewCount: 31, auditFindings: 1, suggestionsCreated: 1, warnings: [] };
      },
      async appendAuditLog() {},
      async appendNotification(_workspaceId: string, notification: Notification) { notifications.push(notification); },
    } as unknown as DataProvider;

    const now = new Date("2026-07-20T12:00:00.000Z");
    const first = await runWorkspaceMonitoring({ provider, workspaceId: data.workspace.id, now, trigger: "scheduled" });
    const second = await runWorkspaceMonitoring({ provider, workspaceId: data.workspace.id, now, trigger: "scheduled" });
    expect(first).toMatchObject({ status: "completed", newSuggestions: 1 });
    expect(second).toMatchObject({ status: "duplicate", newSuggestions: 0 });
    expect(syncCalls).toBe(1);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.title).toContain("new local growth suggestion");
  });
});
