import { describe, expect, it, vi } from "vitest";
import type { DataProvider } from "@/lib/data/provider";
import type { Subscription, TrialNotices } from "@/lib/data/types";
import { buildSeed } from "@/lib/data/seed";
import { TRIAL_ENDED_NOTICE_WINDOW_DAYS, runTrialEmailBatch, trialNoticeDue } from "../trial-emails";

const NOW = new Date("2026-09-03T06:00:00.000Z");
const DAY = 86_400_000;

function iso(offsetDays: number): string {
  return new Date(NOW.getTime() + offsetDays * DAY).toISOString();
}

function sub(offsetDays: number, extra: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub_1",
    workspaceId: "ws_1",
    tier: "growth",
    interval: "monthly",
    status: "trialing",
    trialEndsAt: iso(offsetDays),
    currency: "USD",
    usage: { aiDraftsUsed: 0, aiDraftsLimit: -1, smsCreditsUsed: 0, smsCreditsTotal: 250, requestsSent: 0, reviewsCaptured: 0 },
    ...extra,
  };
}

describe("trialNoticeDue — the send windows", () => {
  it("is quiet while the trial has more than three days left", () => {
    expect(trialNoticeDue(sub(10), NOW)).toBeNull();
    expect(trialNoticeDue(sub(4), NOW)).toBeNull();
  });

  it("owes the 'ending' notice from three days out, once", () => {
    expect(trialNoticeDue(sub(3), NOW)).toBe("ending");
    expect(trialNoticeDue(sub(1), NOW)).toBe("ending");
    expect(trialNoticeDue(sub(2, { trialNotices: { ending: iso(-1) } }), NOW)).toBeNull();
  });

  it("owes the 'ended' notice once the trial has expired, once", () => {
    expect(trialNoticeDue(sub(-0.1), NOW)).toBe("ended");
    expect(trialNoticeDue(sub(-3), NOW)).toBe("ended");
    expect(trialNoticeDue(sub(-3, { trialNotices: { ended: iso(-2) } }), NOW)).toBeNull();
  });

  it("never sends 'ending' to a trial that already expired — the later state wins", () => {
    // Even with no 'ending' marker, an expired trial gets 'ended', not 'ending'.
    expect(trialNoticeDue(sub(-1), NOW)).toBe("ended");
    // And once 'ended' is recorded, nothing more — the missed 'ending' is not back-filled.
    expect(trialNoticeDue(sub(-1, { trialNotices: { ended: iso(-1) } }), NOW)).toBeNull();
  });

  it("does not email about a trial that expired long before this cron existed", () => {
    expect(trialNoticeDue(sub(-TRIAL_ENDED_NOTICE_WINDOW_DAYS), NOW)).toBe("ended");
    expect(trialNoticeDue(sub(-(TRIAL_ENDED_NOTICE_WINDOW_DAYS + 1)), NOW)).toBeNull();
  });

  it("ignores anything that is not a trial", () => {
    expect(trialNoticeDue(sub(-1, { status: "active" }), NOW)).toBeNull();
    expect(trialNoticeDue(sub(-1, { status: "free" }), NOW)).toBeNull();
    expect(trialNoticeDue({ status: "trialing" }, NOW)).toBeNull();
  });
});

describe("runTrialEmailBatch", () => {
  function fakeProvider(subscriptions: Subscription[]) {
    const data = buildSeed();
    data.workspace.isDemo = false;
    data.owner.email = "owner@harbourview.ca";
    data.owner.name = "Priya Sharma";
    const marks: { workspaceId: string; kind: keyof TrialNotices; sentAt: string }[] = [];
    const provider = {
      async listTrialingSubscriptions() {
        return subscriptions;
      },
      async getData(workspaceId: string) {
        const match = subscriptions.find((item) => item.workspaceId === workspaceId);
        return match ? { ...data, subscription: match } : null;
      },
      async markTrialNoticeSent(workspaceId: string, kind: keyof TrialNotices, sentAt: string) {
        marks.push({ workspaceId, kind, sentAt });
        const match = subscriptions.find((item) => item.workspaceId === workspaceId);
        if (match) match.trialNotices = { ...match.trialNotices, [kind]: sentAt };
      },
    } as unknown as DataProvider;
    return { provider, marks, data };
  }

  it("sends each due notice to the owner, with the billing link, and records the send", async () => {
    const { provider, marks } = fakeProvider([
      sub(2, { workspaceId: "ws_ending" }),
      sub(-1, { workspaceId: "ws_ended" }),
      sub(15, { workspaceId: "ws_quiet" }),
    ]);
    const send = vi.fn().mockResolvedValue({ ok: true, id: "msg" });

    const result = await runTrialEmailBatch({ provider, now: NOW, baseUrl: "https://app.example.com", send });

    expect(result).toMatchObject({ checked: 3, due: 2, sent: { ending: 1, ended: 1 }, skipped: 0, failed: 0, errors: [] });
    expect(send).toHaveBeenCalledTimes(2);
    const calls = send.mock.calls.map((call) => call[0]);
    for (const call of calls) {
      expect(call.to).toBe("owner@harbourview.ca");
      expect(call.html).toContain("https://app.example.com/app/settings/billing");
      expect(call.text).toContain("https://app.example.com/app/settings/billing");
    }
    expect(calls.find((call) => call.workspaceId === "ws_ending")?.subject).toMatch(/ends in 2 days/);
    expect(calls.find((call) => call.workspaceId === "ws_ended")?.subject).toMatch(/has ended/);
    expect(marks.map((mark) => [mark.workspaceId, mark.kind])).toEqual([
      ["ws_ending", "ending"],
      ["ws_ended", "ended"],
    ]);
  });

  it("is idempotent: a second run on the same day sends nothing", async () => {
    const { provider } = fakeProvider([sub(2, { workspaceId: "ws_ending" })]);
    const send = vi.fn().mockResolvedValue({ ok: true, id: "msg" });
    await runTrialEmailBatch({ provider, now: NOW, baseUrl: "https://x", send });
    const again = await runTrialEmailBatch({ provider, now: NOW, baseUrl: "https://x", send });
    expect(send).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ due: 0, sent: { ending: 0, ended: 0 } });
  });

  it("does not record a send that failed, so it is retried next run", async () => {
    const { provider, marks } = fakeProvider([sub(1, { workspaceId: "ws_ending" })]);
    const send = vi.fn().mockResolvedValue({ ok: false, reason: "error", detail: "503 from Resend" });
    const result = await runTrialEmailBatch({ provider, now: NOW, baseUrl: "https://x", send });
    expect(result).toMatchObject({ due: 1, failed: 1, sent: { ending: 0, ended: 0 } });
    expect(result.errors[0]).toContain("ws_ending");
    expect(marks).toEqual([]);
  });

  it("counts an unconfigured sender as skipped, not failed, and leaves the marker alone", async () => {
    const { provider, marks } = fakeProvider([sub(-1, { workspaceId: "ws_ended" })]);
    const send = vi.fn().mockResolvedValue({ ok: false, reason: "not_configured" });
    const result = await runTrialEmailBatch({ provider, now: NOW, baseUrl: "https://x", send });
    expect(result).toMatchObject({ due: 1, skipped: 1, failed: 0 });
    expect(marks).toEqual([]);
  });

  it("skips the demo workspace and never lets one bad tenant stop the batch", async () => {
    const { provider, data } = fakeProvider([
      sub(-1, { workspaceId: "ws_demo" }),
      sub(-1, { workspaceId: "ws_ok" }),
    ]);
    const realGetData = provider.getData.bind(provider);
    provider.getData = async (workspaceId: string) => {
      if (workspaceId === "ws_demo") return { ...data, workspace: { ...data.workspace, isDemo: true } };
      if (workspaceId === "ws_boom") throw new Error("connection reset");
      return realGetData(workspaceId);
    };
    const send = vi.fn().mockResolvedValue({ ok: true, id: "msg" });
    const result = await runTrialEmailBatch({ provider, now: NOW, baseUrl: "https://x", send });
    expect(result).toMatchObject({ due: 2, skipped: 1, sent: { ended: 1 } });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].workspaceId).toBe("ws_ok");
  });

  it("survives a provider throw mid-batch and reports it", async () => {
    const { provider } = fakeProvider([
      sub(-1, { workspaceId: "ws_boom" }),
      sub(-1, { workspaceId: "ws_ok" }),
    ]);
    const realGetData = provider.getData.bind(provider);
    provider.getData = async (workspaceId: string) => {
      if (workspaceId === "ws_boom") throw new Error("connection reset");
      return realGetData(workspaceId);
    };
    const send = vi.fn().mockResolvedValue({ ok: true, id: "msg" });
    const result = await runTrialEmailBatch({ provider, now: NOW, baseUrl: "https://x", send });
    expect(result).toMatchObject({ due: 2, failed: 1, sent: { ended: 1 } });
    expect(result.errors).toEqual(["ws_boom: connection reset"]);
  });
});
