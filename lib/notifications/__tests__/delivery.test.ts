import { describe, it, expect } from "vitest";
import { notifyDeliveryFailure } from "@/lib/notifications/delivery";
import { emptyFoundlyData } from "@/lib/data/empty";
import type { DataProvider } from "@/lib/data/provider";
import type { Notification } from "@/lib/data/types";

function workspace() {
  return emptyFoundlyData({
    workspaceId: "ws_test",
    organizationId: "org_test",
    userId: "usr_test",
    businessName: "Test Business",
    ownerName: "Alex Owner",
    email: "alex@example.com",
    industryKey: "cafe",
    category: "Cafe",
    region: "CA",
  });
}

/** Mirrors both real providers: an insert whose id already exists is ignored. */
function recorder(data: ReturnType<typeof workspace> | null = workspace()) {
  const notifications: Notification[] = [];
  const provider = {
    async getData() {
      return data;
    },
    async appendNotification(_ws: string, n: Notification) {
      if (!notifications.some((existing) => existing.id === n.id)) notifications.push(n);
    },
  } as unknown as DataProvider;
  return { provider, notifications };
}

const AT = new Date("2026-07-20T09:00:00.000Z");

describe("notifyDeliveryFailure", () => {
  it("posts a delivery notification carrying the provider detail", async () => {
    const { provider, notifications } = recorder();
    const posted = await notifyDeliveryFailure({
      provider,
      workspaceId: "ws_test",
      at: AT,
      detail: "Twilio delivery failed (30007).",
    });
    expect(posted).toBe(true);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.kind).toBe("delivery");
    expect(notifications[0]!.read).toBe(false);
    expect(notifications[0]!.body).toContain("Twilio delivery failed (30007).");
  });

  it("posts once a day however many messages fail in a batch", async () => {
    const { provider, notifications } = recorder();
    for (let i = 0; i < 25; i += 1) {
      await notifyDeliveryFailure({ provider, workspaceId: "ws_test", at: AT });
    }
    expect(notifications).toHaveLength(1);
  });

  it("alerts again the next day", async () => {
    const { provider, notifications } = recorder();
    await notifyDeliveryFailure({ provider, workspaceId: "ws_test", at: AT });
    await notifyDeliveryFailure({
      provider,
      workspaceId: "ws_test",
      at: new Date("2026-07-21T09:00:00.000Z"),
    });
    expect(notifications).toHaveLength(2);
  });

  it("never claims a count, since only the first failure of the day is announced", async () => {
    const { provider, notifications } = recorder();
    await notifyDeliveryFailure({ provider, workspaceId: "ws_test", at: AT });
    expect(notifications[0]!.body).not.toMatch(/\d+ (message|request|review request)s/);
    expect(notifications[0]!.title).toBe("A review request didn't reach the customer");
  });

  it("does nothing for an unknown workspace or an unusable timestamp", async () => {
    const missing = recorder(null);
    expect(
      await notifyDeliveryFailure({ provider: missing.provider, workspaceId: "ws_gone", at: AT }),
    ).toBe(false);

    const ok = recorder();
    expect(
      await notifyDeliveryFailure({ provider: ok.provider, workspaceId: "ws_test", at: new Date("nope") }),
    ).toBe(false);
    expect(ok.notifications).toEqual([]);
  });

  it("swallows a write failure rather than breaking the webhook that recorded the outcome", async () => {
    const provider = {
      async getData() {
        return workspace();
      },
      async appendNotification() {
        throw new Error("db down");
      },
    } as unknown as DataProvider;
    expect(await notifyDeliveryFailure({ provider, workspaceId: "ws_test", at: AT })).toBe(false);
  });
});
