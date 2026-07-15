import { SignJWT, jwtVerify } from "jose";

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
}

const FALLBACK_SECRET = "foundly-dev-secret-set-AUTH_SECRET-in-production";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET || FALLBACK_SECRET);
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
      typeof payload.role !== "string"
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
    };
  } catch {
    return null;
  }
}

export { SESSION_TTL_SECONDS };
