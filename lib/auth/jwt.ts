import { SignJWT, jwtVerify } from "jose";
import { resolveSecret } from "@/lib/security/secret";

/**
 * Session JWT — signed HS256, httpOnly cookie payload.
 * AUTH_SECRET should be set in production; a build-stable fallback keeps
 * zero-config demo deploys working (sessions reset when the secret changes).
 */

export interface SessionClaims {
  userId: string;
  workspaceId: string;
  role: "owner" | "manager" | "staff" | "agency_admin" | "platform_admin";
  isDemo: boolean;
  name: string;
  email: string;
  /** Revocation counter (V8). Compared against the user's stored value on real
   * sessions; a mismatch invalidates the token. Absent → treated as 0. */
  sessionVersion?: number;
  /**
   * Set while an agency admin or platform admin is working INSIDE another
   * workspace (an agency's client, or a tenant opened from the ops console):
   * `workspaceId` is then that workspace, and this is the admin's own
   * workspace to return to. Absent for every other session. The role never
   * changes, so the audit trail and the shell both know who is acting.
   */
  homeWorkspaceId?: string;
}

const FALLBACK_SECRET = "foundly-dev-secret-set-AUTH_SECRET-in-production";
const SESSION_ROLES = new Set<SessionClaims["role"]>([
  "owner",
  "manager",
  "staff",
  "agency_admin",
  "platform_admin",
]);

function secretKey(): Uint8Array {
  return new TextEncoder().encode(
    resolveSecret({
      value: process.env.AUTH_SECRET,
      name: "AUTH_SECRET",
      devFallback: FALLBACK_SECRET,
    }),
  );
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      typeof payload.userId !== "string" ||
      typeof payload.workspaceId !== "string" ||
      typeof payload.role !== "string" ||
      !SESSION_ROLES.has(payload.role as SessionClaims["role"])
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      workspaceId: payload.workspaceId,
      role: payload.role as SessionClaims["role"],
      isDemo: Boolean(payload.isDemo),
      name: typeof payload.name === "string" ? payload.name : "",
      email: typeof payload.email === "string" ? payload.email : "",
      sessionVersion:
        typeof payload.sessionVersion === "number" ? payload.sessionVersion : 0,
      ...(typeof payload.homeWorkspaceId === "string" && payload.homeWorkspaceId
        ? { homeWorkspaceId: payload.homeWorkspaceId }
        : {}),
    };
  } catch {
    return null;
  }
}

export { SESSION_TTL_SECONDS };
