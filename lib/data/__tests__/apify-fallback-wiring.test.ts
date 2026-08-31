import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ProfileSyncOutcome } from "@/lib/google/profile-sync";

/**
 * Wiring check for the public-data fallback.
 *
 * The mapping has its own unit tests; this proves the PROVIDER actually reaches
 * for it. The first version of this feature shipped as dead code — the sync
 * still returned `pendingApproval` and nothing ever called the Apify path — so
 * the thing worth testing is the branch, not the transform.
 *
 * The Drizzle provider carries an identical branch. Both must stay behaviourally
 * the same; that duplication is a known recurring source of bugs here.
 */

const gbpRef: { current: ProfileSyncOutcome } = { current: { ok: true } };
const apifyRef: { current: ProfileSyncOutcome } = { current: { ok: true } };
let apifyCalls = 0;

vi.mock("@/lib/google/profile-sync", () => ({
  fetchGoogleProfile: async () => gbpRef.current,
  fetchApifyProfile: async () => {
    apifyCalls += 1;
    return apifyRef.current;
  },
  locationFromProfileSnapshot: (location: unknown) => location,
}));

const { memoryProvider } = await import("@/lib/data/memory-provider");

async function freshWorkspace(): Promise<string> {
  const result = await memoryProvider.registerUser({
    name: "Owner",
    email: `owner_${Math.random().toString(36).slice(2)}@example.com`,
    password: "correct-horse-battery",
    businessName: "Harbour Dental",
    industryKey: "dentist",
    region: "CA",
  });
  if (!("user" in result) || !result.user) throw new Error("registration failed");
  return result.user.workspaceId;
}

function googleIntegrationDetail(integrations: Array<{ provider: string; detail?: string }>) {
  return integrations.find((i) => i.provider === "google")?.detail ?? "";
}

beforeEach(() => {
  apifyCalls = 0;
  gbpRef.current = { ok: true };
  apifyRef.current = { ok: true };
});

describe("sync falls back to public data while GBP approval is pending", () => {
  it("uses the Apify outcome instead of stopping at pendingApproval", async () => {
    const workspaceId = await freshWorkspace();
    gbpRef.current = { ok: true, pendingApproval: true };
    apifyRef.current = { ok: true, rating: 4.6, reviewCount: 70206 };

    const result = await memoryProvider.syncGoogleProfile(workspaceId);

    expect(apifyCalls).toBe(1);
    // The whole point: the caller is NOT told to sit and wait for Google.
    expect(result.pendingApproval).toBeUndefined();
    expect(result.ok).toBe(true);

    const data = await memoryProvider.getData(workspaceId);
    expect(data?.location.rating).toBe(4.6);
    expect(data?.location.reviewCount).toBe(70206);
  });

  it("says the numbers came from public data, and that views are not measured", async () => {
    const workspaceId = await freshWorkspace();
    gbpRef.current = { ok: true, pendingApproval: true };
    apifyRef.current = { ok: true, rating: 4.6, reviewCount: 70206 };

    await memoryProvider.syncGoogleProfile(workspaceId);

    const data = await memoryProvider.getData(workspaceId);
    const detail = googleIntegrationDetail(data?.integrations ?? []);
    expect(detail).toMatch(/public Google data/i);
    // Owner-only metrics must never be implied to be present.
    expect(detail).toMatch(/not measured/i);
  });

  it("reports pending approval unchanged when Apify is not configured", async () => {
    const workspaceId = await freshWorkspace();
    gbpRef.current = { ok: true, pendingApproval: true };
    apifyRef.current = { ok: false, error: "Apify isn't configured" };

    const result = await memoryProvider.syncGoogleProfile(workspaceId);

    expect(apifyCalls).toBe(1);
    expect(result.pendingApproval).toBe(true);
    const data = await memoryProvider.getData(workspaceId);
    expect(googleIntegrationDetail(data?.integrations ?? [])).toMatch(/approval pending/i);
  });

  it("never reaches for public data when the owned sync worked", async () => {
    const workspaceId = await freshWorkspace();
    gbpRef.current = { ok: true, rating: 5, reviewCount: 12 };

    await memoryProvider.syncGoogleProfile(workspaceId);

    // An approved profile must keep using Google's own answer.
    expect(apifyCalls).toBe(0);
  });

  it("surfaces a real Google failure rather than papering over it with a scrape", async () => {
    const workspaceId = await freshWorkspace();
    gbpRef.current = { ok: false, error: "Google connection expired — reconnect Google." };

    const result = await memoryProvider.syncGoogleProfile(workspaceId);

    expect(result.ok).toBe(false);
    expect(apifyCalls).toBe(0);
  });
});
