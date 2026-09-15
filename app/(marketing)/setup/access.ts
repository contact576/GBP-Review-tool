import "server-only";
import { getSession, type Session } from "@/lib/auth/session";

/**
 * Access gate for the self-service setup surface (page + actions).
 *
 * Security note (V1/V2): `/setup` lives in the (marketing) route group, which
 * the middleware matcher does NOT cover — so this in-code check is the ONLY
 * gate. It must run at the top of the page render and inside every setup
 * server action.
 *
 * Policy: a REAL (non-demo) platform_admin session only. The demo "platform_admin"
 * session (isDemo=true) is explicitly excluded so the demo showcase cannot run
 * production schema DDL or spend live AI/Places budget.
 *
 * Bootstrap: registration self-initializes the schema on first signup, so
 * locking this surface never blocks a fresh deployment from coming up.
 */
export async function getSetupAdmin(): Promise<Session | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.isDemo) return null;
  if (session.role !== "platform_admin") return null;
  return session;
}

export async function isSetupAdmin(): Promise<boolean> {
  return (await getSetupAdmin()) !== null;
}
