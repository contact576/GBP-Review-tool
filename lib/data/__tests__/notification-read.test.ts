import { describe, it, expect, beforeEach } from "vitest";
import { memoryProvider, DEMO_WORKSPACE_ID } from "@/lib/data/memory-provider";

/**
 * Per-item read must clear exactly one row. The regression this guards against
 * is the obvious shortcut — implementing single read as "mark all read" — which
 * would silently discard every other unread notification the moment an owner
 * followed one link.
 */
describe("memory provider: markNotificationRead", () => {
  beforeEach(async () => {
    await memoryProvider.resetDemo();
  });

  it("marks only the named notification read", async () => {
    const before = (await memoryProvider.getData(DEMO_WORKSPACE_ID))!;
    const unread = before.notifications.filter((n) => !n.read);
    expect(unread.length).toBeGreaterThan(1);
    const target = unread[0]!;

    await memoryProvider.markNotificationRead(DEMO_WORKSPACE_ID, target.id);

    const after = (await memoryProvider.getData(DEMO_WORKSPACE_ID))!;
    expect(after.notifications.find((n) => n.id === target.id)!.read).toBe(true);
    for (const other of unread.slice(1)) {
      expect(after.notifications.find((n) => n.id === other.id)!.read).toBe(false);
    }
  });

  it("treats an unknown id as a no-op rather than an error", async () => {
    await expect(memoryProvider.markNotificationRead(DEMO_WORKSPACE_ID, "ntf_nope")).resolves.toBeUndefined();
    const after = (await memoryProvider.getData(DEMO_WORKSPACE_ID))!;
    expect(after.notifications.filter((n) => !n.read).length).toBeGreaterThan(0);
  });

  it("still clears everything when the owner asks for mark-all-read", async () => {
    await memoryProvider.markNotificationsRead(DEMO_WORKSPACE_ID);
    const after = (await memoryProvider.getData(DEMO_WORKSPACE_ID))!;
    expect(after.notifications.every((n) => n.read)).toBe(true);
  });
});
