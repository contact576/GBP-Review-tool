import { cookies } from "next/headers";

/**
 * Demo session — a signed-ish cookie standing in for real auth (Clerk later).
 * Value encodes the role so agency/admin surfaces can be role-gated.
 */
export const SESSION_COOKIE = "foundly_session";

export type SessionRole = "owner" | "agency_admin" | "platform_admin";

export interface Session {
  role: SessionRole;
  name: string;
}

const ROLE_NAMES: Record<SessionRole, string> = {
  owner: "Alex Chen",
  agency_admin: "Northside Admin",
  platform_admin: "Foundly Ops",
};

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const role = (["owner", "agency_admin", "platform_admin"] as const).find((r) => r === raw);
  if (!role) return null;
  return { role, name: ROLE_NAMES[role] };
}

export async function setSession(role: SessionRole): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
