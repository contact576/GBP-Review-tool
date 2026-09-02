import { cache } from "react";
import { redirect } from "next/navigation";
import type { DataProvider } from "./provider";
import { memoryProvider, DEMO_WORKSPACE_ID } from "./memory-provider";
import { reconcileIntegrations } from "./integration-status";
import { emailEnabledFor } from "@/lib/email";
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

/**
 * The real-account provider (Postgres when DATABASE_URL is set, else memory),
 * independent of any session. Auth flows that run BEFORE a session exists —
 * registration, email/password login, Google sign-in upsert — must use this,
 * NOT `getProviderFor(null)` (which returns the demo memory store and would
 * write accounts that later reads can never find).
 */
export async function getRealProvider(): Promise<DataProvider> {
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
 * One workspace fetch per request, shared by every caller.
 *
 * `provider.getData` fans out to ~21 tables. A single `/app` render used to run
 * it three times over (layout, page, and the org rollup) for the *same*
 * workspace — ~60 queries where 21 would do, each paying a full round trip to
 * Postgres. React's `cache` is request-scoped and keyed on the arguments, so
 * the provider singleton plus the workspace id keep tenants strictly isolated.
 */
const loadWorkspaceData = cache(
  async (provider: DataProvider, workspaceId: string): Promise<FoundlyData | null> => {
    const data = await provider.getData(workspaceId);
    if (!data) return data;
    return reconcileIntegrations(data, {
      emailOn: await emailEnabledFor(workspaceId),
    });
  },
);

/**
 * The whole current-tenant dataset. Signature unchanged from v1 — resolves
 * the session internally so all pages keep calling `await getData()`.
 */
export async function getData(): Promise<FoundlyData> {
  const { data } = await getSessionAndData();
  return data;
}

/** Session + data in one call, for layouts that need both. */
export async function getSessionAndData(): Promise<{ session: Session; data: FoundlyData }> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const provider = await getProviderFor(session);
  const data = await loadWorkspaceData(provider, session.workspaceId);
  // Stale session pointing at a vanished workspace (e.g. memory reset).
  if (!data) redirect("/sign-in?expired=1");
  return { session, data };
}

/**
 * The agency's OWN workspace for this session.
 *
 * While an agency admin is working inside a client (`agencyWorkspaceId` set —
 * see lib/auth/jwt.ts) the session's `workspaceId` is the client's. The agency
 * console must still describe the agency, so everything under /agency resolves
 * its workspace through here rather than from `session.workspaceId`. This is
 * deliberately a pure read: entering and leaving a client are explicit
 * actions, never a side effect of rendering a page (a prefetched GET that
 * rewrote the session cookie once silently kicked admins out of the client).
 */
export function agencyHomeWorkspaceId(session: Session): string {
  return session.role === "agency_admin" && session.agencyWorkspaceId
    ? session.agencyWorkspaceId
    : session.workspaceId;
}

/** Session + the AGENCY's data, for every /agency surface. */
export async function getAgencySessionAndData(): Promise<{ session: Session; data: FoundlyData }> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const provider = await getProviderFor(session);
  const data = await loadWorkspaceData(provider, agencyHomeWorkspaceId(session));
  if (!data) redirect("/sign-in?expired=1");
  return { session, data };
}

export async function getAgencyData(): Promise<FoundlyData> {
  const { data } = await getAgencySessionAndData();
  return data;
}

/** Live agency rollup, refreshed from each isolated client workspace. */
export async function getAgencyClients(): Promise<FoundlyData["agency"]["clients"]> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const provider = await getProviderFor(session);
  return provider.listAgencyClients(agencyHomeWorkspaceId(session));
}

/** Public token lookup across stores (customer review flow — no session). */
export async function findRequestByToken(token: string): Promise<
  | {
      request: import("./types").ReviewRequest;
      location: FoundlyData["location"];
      staffName?: string;
      /** First service captured on the customer (staff-captured requests). */
      serviceHint?: string;
      /** Every service captured on the customer, most relevant first. */
      serviceHints?: string[];
      industryKey?: string;
      /**
       * The owner's custom services/attributes. The customer review page offers
       * these before the catalog defaults, so a workspace that renamed its
       * services sees its own words on the public page.
       */
      industryConfig?: import("./types").IndustryConfig;
    }
  | null
> {
  for (const provider of await getPublicProviders()) {
    const result = await provider.getRequestByToken(token);
    if (result) {
      const data = await loadWorkspaceData(provider, result.location.workspaceId);
      const staff = data?.staff.find((s) => s.id === result.request.staffId);
      const customer = data?.customers.find((c) => c.id === result.request.customerId);
      return {
        ...result,
        staffName: staff?.displayName.split(/\s+/)[0],
        serviceHint: customer?.services[0],
        serviceHints: customer?.services,
        industryKey: data?.workspace.vertical,
        industryConfig: data?.workspace.industryConfig,
      };
    }
  }
  return null;
}

export function isDbBacked(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Current session-version for a real (non-demo) user, used by getSession to
 * enforce revocation (V8). Only meaningful when DB-backed; returns null for
 * unknown users so the caller can decide how to treat it.
 */
export async function currentSessionVersion(userId: string): Promise<number | null> {
  const provider = await dbProvider();
  return provider.getUserSessionVersion(userId);
}

/** Public review-widget payload for an embeddable QR slug (no session). */
export interface WidgetData {
  business: string;
  rating: number;
  reviewCount: number;
  reviewUrl: string;
  reviews: { author: string; rating: number; text: string }[];
}

export async function getWidgetData(slug: string): Promise<WidgetData | null> {
  for (const provider of await getPublicProviders()) {
    const wsId = await provider.getWorkspaceIdBySlug(slug);
    if (!wsId) continue;
    const data = await loadWorkspaceData(provider, wsId);
    if (!data) continue;
    const reviews = data.reviews
      .filter((r) => r.text.trim().length > 0 && r.rating >= 4)
      .slice(0, 6)
      .map((r) => ({ author: r.author, rating: r.rating, text: r.text }));
    return {
      business: data.location.name,
      rating: data.location.rating,
      reviewCount: data.location.reviewCount,
      reviewUrl: data.location.reviewUrl,
      reviews,
    };
  }
  return null;
}

export { DEMO_WORKSPACE_ID };
export type { DataProvider } from "./provider";
export * from "./types";
