import { redirect } from "next/navigation";
import type { DataProvider } from "./provider";
import { memoryProvider, DEMO_WORKSPACE_ID } from "./memory-provider";
import { getSession, type Session } from "@/lib/auth/session";
import type { FoundlyData } from "./types";

/**
 * Data access pivot.
 *  - Demo sessions ALWAYS use the in-memory provider (seeded Harbourview) —
 *    demo data never touches the real database.
 *  - Real sessions use Postgres (Drizzle) when DATABASE_URL is set, otherwise
 *    the in-memory provider (honest "temporary until database connected"
 *    states are surfaced in the UI).
 */

let cachedDbProvider: DataProvider | null = null;

async function dbProvider(): Promise<DataProvider> {
  if (cachedDbProvider) return cachedDbProvider;
  if (process.env.DATABASE_URL) {
    try {
      const mod = await import("./drizzle-provider");
      cachedDbProvider = mod.drizzleProvider;
    } catch {
      cachedDbProvider = memoryProvider;
    }
  } else {
    cachedDbProvider = memoryProvider;
  }
  return cachedDbProvider;
}

/** Provider for a given session (demo → memory, real → env-based). */
export async function getProviderFor(session: Session | null): Promise<DataProvider> {
  if (!session || session.isDemo) return memoryProvider;
  return dbProvider();
}

/** Provider for public token/slug surfaces (no session). Checks both stores. */
export async function getPublicProviders(): Promise<DataProvider[]> {
  const providers: DataProvider[] = [memoryProvider];
  if (process.env.DATABASE_URL) {
    const real = await dbProvider();
    if (real !== memoryProvider) providers.unshift(real);
  }
  return providers;
}

/**
 * The whole current-tenant dataset. Signature unchanged from v1 — resolves
 * the session internally so all pages keep calling `await getData()`.
 */
export async function getData(): Promise<FoundlyData> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const provider = await getProviderFor(session);
  const data = await provider.getData(session.workspaceId);
  if (!data) {
    // Stale session pointing at a vanished workspace (e.g. memory reset).
    redirect("/sign-in?expired=1");
  }
  return data;
}

/** Session + data in one call, for layouts that need both. */
export async function getSessionAndData(): Promise<{ session: Session; data: FoundlyData }> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const provider = await getProviderFor(session);
  const data = await provider.getData(session.workspaceId);
  if (!data) redirect("/sign-in?expired=1");
  return { session, data };
}

/** Public token lookup across stores (customer review flow — no session). */
export async function findRequestByToken(token: string): Promise<
  | {
      request: import("./types").ReviewRequest;
      location: FoundlyData["location"];
      staffName?: string;
    }
  | null
> {
  for (const provider of await getPublicProviders()) {
    const result = await provider.getRequestByToken(token);
    if (result) {
      const data = await provider.getData(result.location.workspaceId);
      const staff = data?.staff.find((s) => s.id === result.request.staffId);
      return { ...result, staffName: staff?.displayName.split(/\s+/)[0] };
    }
  }
  return null;
}

export function isDbBacked(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export { DEMO_WORKSPACE_ID };
export type { DataProvider } from "./provider";
export * from "./types";
