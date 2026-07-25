import { beforeAll, describe, expect, it } from "vitest";
import type { QrAsset } from "@/lib/data/types";

/**
 * End-to-end behaviour of a public /q/{slug} scan against the real in-memory
 * store: where the scanner is sent, and what each hit is allowed to count as.
 *
 * DATABASE_URL is cleared so the public provider list is the memory store only
 * — no connection is ever attempted.
 */
delete process.env.DATABASE_URL;

const DAY = 86_400_000;
const PLACE_ID = "PLACE_TEST_123";
const REVIEW_URL = `https://search.google.com/local/writereview?placeid=${PLACE_ID}`;
const GRACE_DAYS = 90;

let data: typeof import("@/lib/data/memory-provider");
let resolveQrScan: typeof import("@/lib/qr/resolve").resolveQrScan;

beforeAll(async () => {
  data = await import("@/lib/data/memory-provider");
  resolveQrScan = (await import("@/lib/qr/resolve")).resolveQrScan;
});

let seq = 0;

/** A fresh workspace with a Google review URL on file and one location QR. */
async function freshWorkspace(): Promise<{ workspaceId: string; slug: string }> {
  seq += 1;
  const result = await data.memoryProvider.registerUser({
    name: "Morgan Vega",
    email: `qr-owner-${seq}-${Date.now()}@example.com`,
    password: "correct horse battery staple",
    businessName: `Scan Test ${seq}`,
    industryKey: "physiotherapy",
    region: "CA",
  });
  if (!result.ok) throw new Error(result.error);
  const workspaceId = result.user.workspaceId;
  await data.memoryProvider.updateLocationGoogle(workspaceId, { placeId: PLACE_ID });
  const slug = (await assets(workspaceId))[0]!.slug;
  return { workspaceId, slug };
}

async function assets(workspaceId: string): Promise<QrAsset[]> {
  const snapshot = await data.memoryProvider.getData(workspaceId);
  if (!snapshot) throw new Error("workspace vanished");
  return snapshot.qrAssets;
}

async function counters(workspaceId: string): Promise<{ scans: number; pageOpens: number }> {
  const asset = (await assets(workspaceId))[0]!;
  return { scans: asset.scans, pageOpens: asset.pageOpens };
}

function iso(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY).toISOString();
}

describe("active QR asset", () => {
  it("mints a live review session, exactly as before", async () => {
    const { workspaceId, slug } = await freshWorkspace();
    const destination = await resolveQrScan({ slug, hit: "browser_navigation" });

    expect(destination.kind).toBe("review_session");
    if (destination.kind !== "review_session") return;
    expect(destination.token).toBeTruthy();
    expect(destination.business).toBe(`Scan Test ${seq}`);

    const snapshot = await data.memoryProvider.getData(workspaceId);
    const request = snapshot?.requests.find((r) => r.token === destination.token);
    expect(request).toBeDefined();
    expect(snapshot?.customers.some((c) => c.id === request?.customerId)).toBe(true);
  });

  it("preserves per-staff QR attribution into the minted customer and request", async () => {
    const seed = await data.memoryProvider.getData(data.DEMO_WORKSPACE_ID);
    const staffQr = seed?.qrAssets.find((q) => q.scope === "staff");
    expect(staffQr?.staffId).toBeTruthy();

    const destination = await resolveQrScan({ slug: staffQr!.slug, hit: "browser_navigation" });
    expect(destination.kind).toBe("review_session");
    if (destination.kind !== "review_session") return;

    const after = await data.memoryProvider.getData(data.DEMO_WORKSPACE_ID);
    const request = after?.requests.find((r) => r.token === destination.token);
    expect(request?.staffId).toBe(staffQr!.staffId);
    const customer = after?.customers.find((c) => c.id === request?.customerId);
    expect(customer?.staffId).toBe(staffQr!.staffId);
  });

  it("sends an unknown slug to the expired page, never an error", async () => {
    const destination = await resolveQrScan({ slug: "nope-nope-nope", hit: "browser_navigation" });
    expect(destination).toEqual({ kind: "expired", reason: "unknown_slug" });
  });
});

describe("degraded QR asset", () => {
  it("redirects to the public Google review page inside the grace window", async () => {
    const { workspaceId, slug } = await freshWorkspace();
    await data.memoryProvider.setSubscription(workspaceId, {
      status: "canceled",
      currentPeriodEnd: iso(-30),
    });

    const destination = await resolveQrScan({ slug, hit: "browser_navigation" });
    expect(destination).toMatchObject({
      kind: "google_review",
      url: REVIEW_URL,
      basis: "within_grace",
    });
  });

  it("honours the explicit per-asset degrade flag even on a healthy plan", async () => {
    const { workspaceId, slug } = await freshWorkspace();
    const asset = (await assets(workspaceId))[0]!;
    asset.degraded = true;

    const destination = await resolveQrScan({ slug, hit: "browser_navigation" });
    expect(destination).toMatchObject({ kind: "google_review", url: REVIEW_URL });
  });

  it("lands on the expired page once the grace window has run out", async () => {
    const { workspaceId, slug } = await freshWorkspace();
    await data.memoryProvider.setSubscription(workspaceId, {
      status: "canceled",
      currentPeriodEnd: iso(-(GRACE_DAYS + 5)),
    });

    const destination = await resolveQrScan({ slug, hit: "browser_navigation" });
    expect(destination).toEqual({ kind: "expired", reason: "grace_elapsed" });
  });

  it("lands on the expired page when there is no Google review URL to fall back to", async () => {
    seq += 1;
    const result = await data.memoryProvider.registerUser({
      name: "Dana Reyes",
      email: `qr-nogoogle-${seq}-${Date.now()}@example.com`,
      password: "correct horse battery staple",
      businessName: `No Google ${seq}`,
      industryKey: "physiotherapy",
      region: "CA",
    });
    if (!result.ok) throw new Error(result.error);
    const workspaceId = result.user.workspaceId;
    await data.memoryProvider.setSubscription(workspaceId, {
      status: "canceled",
      currentPeriodEnd: iso(-1),
    });
    const slug = (await assets(workspaceId))[0]!.slug;

    const destination = await resolveQrScan({ slug, hit: "browser_navigation" });
    expect(destination).toEqual({ kind: "expired", reason: "no_review_url" });
  });
});

describe("scans and opens are independent signals", () => {
  it("counts a scan and an open for a real browser navigation", async () => {
    const { workspaceId, slug } = await freshWorkspace();
    const before = await counters(workspaceId);

    const destination = await resolveQrScan({ slug, hit: "browser_navigation" });
    expect(destination.kind).toBe("review_session");

    const after = await counters(workspaceId);
    expect(after.scans).toBe(before.scans + 1);
    expect(after.pageOpens).toBe(before.pageOpens + 1);
  });

  it("counts a scan but NOT an open for a preview/bot fetch", async () => {
    const { workspaceId, slug } = await freshWorkspace();
    const before = await counters(workspaceId);

    await resolveQrScan({ slug, hit: "background_fetch" });

    const after = await counters(workspaceId);
    expect(after.scans).toBe(before.scans + 1);
    expect(after.pageOpens).toBe(before.pageOpens);
  });

  it("lets the open rate fall below 100% — the old lockstep bug", async () => {
    const { workspaceId, slug } = await freshWorkspace();
    await resolveQrScan({ slug, hit: "background_fetch" });
    await resolveQrScan({ slug, hit: "background_fetch" });
    await resolveQrScan({ slug, hit: "background_fetch" });
    await resolveQrScan({ slug, hit: "browser_navigation" });

    const { scans, pageOpens } = await counters(workspaceId);
    expect(scans).toBe(4);
    expect(pageOpens).toBe(1);
    expect(Math.round((pageOpens / scans) * 100)).toBe(25);
  });

  it("counts a degraded scan as a scan, but never as an open", async () => {
    const { workspaceId, slug } = await freshWorkspace();
    await data.memoryProvider.setSubscription(workspaceId, {
      status: "canceled",
      currentPeriodEnd: iso(-2),
    });
    const before = await counters(workspaceId);

    const destination = await resolveQrScan({ slug, hit: "browser_navigation" });
    expect(destination.kind).toBe("google_review");

    const after = await counters(workspaceId);
    expect(after.scans).toBe(before.scans + 1);
    expect(after.pageOpens).toBe(before.pageOpens);
  });
});
