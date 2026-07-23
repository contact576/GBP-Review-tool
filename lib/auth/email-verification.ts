import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveSecret } from "@/lib/security/secret";

/**
 * Stateless email-verification tokens (V17).
 *
 * A signed `userId.expiry.signature` triple — no database row needed. Email
 * verification is low-stakes (clicking the link twice simply re-verifies), so
 * single-use tracking is unnecessary; expiry + HMAC integrity are sufficient.
 * Signed with the same hardened secret as the rest of the app (resolveSecret),
 * so a forged link cannot mark an address verified.
 */
const TTL_MS = 24 * 60 * 60_000; // 24 hours
const USER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function secret(): string {
  return resolveSecret({
    value: process.env.AUTH_SECRET,
    name: "AUTH_SECRET",
    devFallback: "foundly-email-verification-development-only",
  });
}

function sign(userId: string, expiresAt: number): string {
  return createHmac("sha256", secret())
    .update(`email-verify:v1:${userId}:${expiresAt}`)
    .digest("base64url");
}

export function createEmailVerificationToken(userId: string, now = Date.now()): string {
  const expiresAt = now + TTL_MS;
  return `${userId}.${expiresAt}.${sign(userId, expiresAt)}`;
}

/** Returns the userId when the token is valid and unexpired, else null. */
export function verifyEmailVerificationToken(token: string, now = Date.now()): string | null {
  if (typeof token !== "string" || token.length > 400) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiryRaw, supplied] = parts;
  if (!userId || !USER_ID_RE.test(userId)) return null;
  const expiresAt = Number(expiryRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;
  const expected = Buffer.from(sign(userId, expiresAt));
  const actual = Buffer.from(supplied ?? "");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return userId;
}
