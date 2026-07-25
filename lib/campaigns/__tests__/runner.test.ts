import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_WORKSPACE_ID, memoryProvider } from "@/lib/data/memory-provider";
import {
  commitCampaignSend,
  drainDueCampaigns,
  previewCampaign,
  scheduleCampaign,
} from "../runner";
import type { CampaignTransport } from "../send";

/**
 * The persisted half of the pipeline, against a real provider.
 *
 * These are the assertions that catch the bug this work exists to fix: the
 * campaign row used to carry a hardcoded {sent: 0, opened: 0, clicked: 0}
 * forever. Here the counters must come back from storage matching what the
 * transport actually did.
 */

const BASE = "https://app.example.test";
const DAYTIME = new Date("2026-07-25T18:00:00.000Z");

function transport(overrides: Partial<CampaignTransport> = {}): CampaignTransport {
  return {
    emailEnabled: () => true,
    smsEnabled: () => true,
    sendEmail: vi.fn(async () => ({ ok: true as const, id: "resend_1" })),
    sendSms: vi.fn(async () => ({ ok: true as const, sid: "SM1", status: "queued" })),
    ...overrides,
  };
}

async function newCampaign(overrides: Parameters<typeof memoryProvider.createCampaign>[1]) {
  return memoryProvider.createCampaign(DEMO_WORKSPACE_ID, overrides);
}

beforeEach(async () => {
  await memoryProvider.resetDemo();
});

describe("commitCampaignSend — persisted outcome", () => {
  it("writes real sent/failed/skipped counts, not zeros", async () => {
    const campaign = await newCampaign({
      locationId: "loc_harbourview",
      name: "Summer check-in",
      type: "promo",
      consentBasis: "marketing",
      channel: "email",
      subject: "How have you been?",
      body: "Hi {first_name}, we would love to see you again.",
    });
    expect(campaign.stats).toEqual({ sent: 0, opened: 0, clicked: 0 });

    const result = await commitCampaignSend({
      provider: memoryProvider,
      workspaceId: DEMO_WORKSPACE_ID,
      campaignId: campaign.id,
      baseUrl: BASE,
      now: DAYTIME,
      transport: transport(),
    });

    expect(result.ok).toBe(true);
    expect(result.counts.sent).toBeGreaterThan(0);

    const stored = await memoryProvider.getCampaign(DEMO_WORKSPACE_ID, campaign.id);
    expect(stored?.stats.sent).toBe(result.counts.sent);
    expect(stored?.stats.failed).toBe(result.counts.failed);
    expect(stored?.stats.skipped).toBe(result.counts.skipped);
    expect(stored?.status).toBe("sent");
    expect(stored?.delivery?.state).toBe("delivered");
    // Every recipient carries its own outcome, not just an aggregate.
    expect(stored?.delivery?.snapshot?.recipients.every((r) => r.outcome === "sent")).toBe(true);
    expect(stored?.delivery?.snapshot?.recipients[0]?.providerId).toBe("resend_1");
  });

  it("consumes SMS credits from the subscription only for messages that went out", async () => {
    const before = await memoryProvider.getData(DEMO_WORKSPACE_ID);
    const usedBefore = before?.subscription.usage.smsCreditsUsed ?? 0;

    const campaign = await newCampaign({
      locationId: "loc_harbourview",
      name: "Text check-in",
      type: "reminder",
      consentBasis: "marketing",
      channel: "sms",
      body: "Quick hello from the clinic.",
    });

    const result = await commitCampaignSend({
      provider: memoryProvider,
      workspaceId: DEMO_WORKSPACE_ID,
      campaignId: campaign.id,
      baseUrl: BASE,
      now: DAYTIME,
      transport: transport(),
    });

    const after = await memoryProvider.getData(DEMO_WORKSPACE_ID);
    expect(after?.subscription.usage.smsCreditsUsed).toBe(usedBefore + result.creditsUsed);
    expect(result.creditsUsed).toBe(result.counts.sent);
  });

  it("spends no credits and claims nothing when Twilio is unconfigured", async () => {
    const before = await memoryProvider.getData(DEMO_WORKSPACE_ID);
    const usedBefore = before?.subscription.usage.smsCreditsUsed ?? 0;

    const campaign = await newCampaign({
      locationId: "loc_harbourview",
      name: "Text check-in",
      type: "reminder",
      consentBasis: "marketing",
      channel: "sms",
      body: "Quick hello from the clinic.",
    });

    const result = await commitCampaignSend({
      provider: memoryProvider,
      workspaceId: DEMO_WORKSPACE_ID,
      campaignId: campaign.id,
      baseUrl: BASE,
      now: DAYTIME,
      transport: transport({ smsEnabled: () => false }),
    });

    expect(result.ok).toBe(false);
    expect(result.state).toBe("not_configured");
    expect(result.missing).toContain("TWILIO_ACCOUNT_SID");

    const after = await memoryProvider.getData(DEMO_WORKSPACE_ID);
    expect(after?.subscription.usage.smsCreditsUsed).toBe(usedBefore);
    const stored = await memoryProvider.getCampaign(DEMO_WORKSPACE_ID, campaign.id);
    expect(stored?.stats.sent).toBe(0);
    expect(stored?.status).toBe("draft");
    // The attempt is on the record even though nothing was sent.
    expect(stored?.delivery?.attemptedAt).toBe(DAYTIME.toISOString());
  });
});

describe("scheduling and the daily drain", () => {
  it("freezes the audience at schedule time and drains it later", async () => {
    const campaign = await newCampaign({
      locationId: "loc_harbourview",
      name: "Autumn promo",
      type: "promo",
      consentBasis: "marketing",
      channel: "email",
      subject: "Autumn hours",
      body: "Hi {first_name}, our autumn hours are live.",
    });

    const scheduledAt = new Date(DAYTIME.getTime() + 86_400_000).toISOString();
    const scheduled = await scheduleCampaign({
      provider: memoryProvider,
      workspaceId: DEMO_WORKSPACE_ID,
      campaignId: campaign.id,
      scheduledAt,
      now: DAYTIME,
    });
    expect(scheduled.ok).toBe(true);
    expect(scheduled.eligible).toBeGreaterThan(0);

    const stored = await memoryProvider.getCampaign(DEMO_WORKSPACE_ID, campaign.id);
    expect(stored?.status).toBe("scheduled");
    expect(stored?.delivery?.state).toBe("scheduled");
    expect(stored?.delivery?.snapshot?.eligible).toBe(scheduled.eligible);

    // Not due yet.
    expect(await memoryProvider.listDueCampaigns(DAYTIME.toISOString())).toHaveLength(0);

    const later = new Date(DAYTIME.getTime() + 90_000_000);
    const due = await memoryProvider.listDueCampaigns(later.toISOString());
    expect(due.map((item) => item.campaign.id)).toContain(campaign.id);

    const rails = transport();
    const drain = await drainDueCampaigns({
      provider: memoryProvider,
      baseUrl: BASE,
      now: later,
      transport: rails,
    });
    expect(drain.sent).toBe(scheduled.eligible);
    expect(rails.sendEmail).toHaveBeenCalledTimes(scheduled.eligible);

    const afterDrain = await memoryProvider.getCampaign(DEMO_WORKSPACE_ID, campaign.id);
    expect(afterDrain?.status).toBe("sent");
    expect(afterDrain?.scheduledAt).toBeUndefined();
    // Draining twice must not re-send.
    expect(await memoryProvider.listDueCampaigns(later.toISOString())).toHaveLength(0);
  });

  it("refuses a schedule in the past", async () => {
    const campaign = await newCampaign({
      locationId: "loc_harbourview",
      name: "Late promo",
      type: "promo",
      consentBasis: "marketing",
      channel: "email",
      body: "Hello again.",
    });
    const result = await scheduleCampaign({
      provider: memoryProvider,
      workspaceId: DEMO_WORKSPACE_ID,
      campaignId: campaign.id,
      scheduledAt: new Date(DAYTIME.getTime() - 60_000).toISOString(),
      now: DAYTIME,
    });
    expect(result.ok).toBe(false);
    expect(result.note).toMatch(/future/i);
  });

  it("holds a scheduled SMS drained during quiet hours and keeps it queued", async () => {
    const campaign = await newCampaign({
      locationId: "loc_harbourview",
      name: "Night text",
      type: "reminder",
      consentBasis: "marketing",
      channel: "sms",
      body: "Quick hello.",
    });
    const scheduledAt = new Date(DAYTIME.getTime() + 3_600_000).toISOString();
    await scheduleCampaign({
      provider: memoryProvider,
      workspaceId: DEMO_WORKSPACE_ID,
      campaignId: campaign.id,
      scheduledAt,
      now: DAYTIME,
    });

    const night = new Date("2026-07-27T06:00:00.000Z"); // 2am Toronto
    const rails = transport();
    await drainDueCampaigns({
      provider: memoryProvider,
      baseUrl: BASE,
      now: night,
      transport: rails,
    });

    expect(rails.sendSms).not.toHaveBeenCalled();
    const stored = await memoryProvider.getCampaign(DEMO_WORKSPACE_ID, campaign.id);
    expect(stored?.delivery?.state).toBe("held");
    expect(stored?.status).toBe("scheduled");
    // Still queued, so the next daily run picks it up inside the window.
    expect(await memoryProvider.listDueCampaigns(night.toISOString())).toHaveLength(1);
  });
});

describe("previewCampaign", () => {
  it("reports eligibility, cost and readiness before anything is saved", async () => {
    const data = await memoryProvider.getData(DEMO_WORKSPACE_ID);
    expect(data).not.toBeNull();
    if (!data) return;

    const preview = previewCampaign({
      data,
      draft: {
        channel: "email",
        consentBasis: "marketing",
        subject: "Hello",
        body: "Hi {first_name}, a quick note.",
      },
      transport: transport({ emailEnabled: () => false }),
    });

    expect(preview.eligible).toBeGreaterThan(0);
    expect(preview.total).toBe(data.customers.length);
    expect(preview.estimate.creditsRequired).toBe(0);
    expect(preview.channelReady).toBe(false);
    expect(preview.blocking).toHaveLength(0);
  });

  it("surfaces the incentive block before the owner clicks send", async () => {
    const data = await memoryProvider.getData(DEMO_WORKSPACE_ID);
    if (!data) throw new Error("demo workspace missing");
    const preview = previewCampaign({
      data,
      draft: {
        channel: "email",
        consentBasis: "marketing",
        body: "Leave a review for a free coffee.",
      },
      transport: transport(),
    });
    expect(preview.blocking).toHaveLength(1);
    expect(preview.blocking[0]).toMatch(/incentiv/i);
  });
});
