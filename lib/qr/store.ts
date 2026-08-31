import type { QrScanContext } from "./types";

/**
 * Public QR side door onto the data stores.
 *
 * The `/q/{slug}` endpoint has no session, so it has to reach both stores the
 * same way `getPublicProviders()` does — database first (when configured),
 * in-memory second. These two operations are deliberately narrow reads/writes
 * on the QR tables only, so a degraded scan never has to load an entire
 * workspace dataset just to find a review URL.
 */

interface QrStore {
  readQrScanContext(slug: string): Promise<QrScanContext | null>;
  recordQrPageOpen(slug: string): Promise<boolean>;
}

let cached: QrStore[] | null = null;

async function qrStores(): Promise<QrStore[]> {
  if (cached) return cached;
  const stores: QrStore[] = [];
  if (process.env.DATABASE_URL) {
    try {
      const mod = await import("@/lib/data/drizzle-provider");
      stores.push({
        readQrScanContext: mod.readQrScanContext,
        recordQrPageOpen: mod.recordQrPageOpen,
      });
    } catch {
      // Driver unavailable — the in-memory store below still answers.
    }
  }
  const mem = await import("@/lib/data/memory-provider");
  stores.push({
    readQrScanContext: mem.readQrScanContext,
    recordQrPageOpen: mem.recordQrPageOpen,
  });
  cached = stores;
  return stores;
}

/** Degrade context for a public slug, or null when no store knows the slug. */
export async function readQrScanContext(slug: string): Promise<QrScanContext | null> {
  if (!slug) return null;
  for (const store of await qrStores()) {
    try {
      const context = await store.readQrScanContext(slug);
      if (context) return context;
    } catch {
      // This store couldn't answer — try the next one.
    }
  }
  return null;
}

/**
 * Record that a scan was handed a live review page in a real browser.
 * Separate from the scan counter on purpose — see lib/qr/scan-signal.ts.
 */
export async function recordQrPageOpen(slug: string): Promise<boolean> {
  if (!slug) return false;
  for (const store of await qrStores()) {
    try {
      if (await store.recordQrPageOpen(slug)) return true;
    } catch {
      // Analytics must never break a customer's scan.
    }
  }
  return false;
}
