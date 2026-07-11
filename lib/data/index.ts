import type { DataProvider } from "./provider";
import { memoryProvider } from "./memory-provider";
import type { FoundlyData } from "./types";

/**
 * Selects the data provider:
 *  - Postgres (Drizzle) when DATABASE_URL is set — the production path.
 *  - In-memory seeded demo otherwise — zero-config, deploys anywhere.
 *
 * The Drizzle provider is imported lazily so a keyless/DB-less build never
 * loads it, keeping cold starts fast and the bundle lean.
 */
let cached: DataProvider | null = null;

export async function getDataProvider(): Promise<DataProvider> {
  if (cached) return cached;
  if (process.env.DATABASE_URL) {
    try {
      const mod = await import("./drizzle-provider");
      cached = mod.drizzleProvider;
    } catch {
      // If the DB adapter can't load, fail safe to the demo provider.
      cached = memoryProvider;
    }
  } else {
    cached = memoryProvider;
  }
  return cached;
}

/** Convenience: the whole dataset. */
export async function getData(): Promise<FoundlyData> {
  const provider = await getDataProvider();
  return provider.getData();
}

export function isDbBacked(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export type { DataProvider } from "./provider";
export * from "./types";
