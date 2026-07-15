import { cookies } from "next/headers";
import { signSession, verifySession, SESSION_TTL_SECONDS, type SessionClaims } from "./jwt";

/**
 * Session management — signed JWT in an httpOnly cookie.
 * Real accounts carry their own user/workspace; demo entries are explicitly
 * flagged `isDemo` and scoped to the seeded demo workspace.
 */

export const SESSION_COOKIE = "foundly_session";

/** Demo workspace constants (the seeded Harbourview tenant). */
export const DEMO_WORKSPACE_ID = "ws_harbourview";
export const DEMO_USER_ID = "usr_owner";

export type SessionRole = SessionClaims["role"];
export interface Session extends SessionClaims {}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  // Legacy plain-role cookies (pre-auth builds) — treat as demo sessions.
  if (raw === "owner" || raw === "agency_admin" || raw === "platform_admin") {
    return demoClaims(raw);
  }
  return verifySession(raw);
}

export async function createSession(claims: SessionClaims): Promise<void> {
  const store = await cookies();
  const token = await signSession(claims);
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function createDemoSession(role: SessionRole): Promise<void> {
  await createSession(demoClaims(role));
}

export function demoClaims(role: SessionRole): Session {
  const names: Record<string, string> = {
    owner: "Alex Chen",
    manager: "Alex Chen",
    staff: "Priya Sharma",
    agency_admin: "Northside Admin",
    platform_admin: "Foundly Ops",
  };
  return {
    userId: DEMO_USER_ID,
    workspaceId: DEMO_WORKSPACE_ID,
    role,
    isDemo: true,
    name: names[role] ?? "Demo User",
    email: "demo@foundly.app",
  };
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
