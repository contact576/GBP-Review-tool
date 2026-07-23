import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveSecret } from "@/lib/security/secret";

function secret(): string {
  // Previously fell back to a published constant with NO production guard (V11) —
  // any deploy missing AUTH_SECRET signed referral codes with a public secret.
  return resolveSecret({
    value: process.env.AUTH_SECRET,
    name: "AUTH_SECRET",
    devFallback: "foundly-referral-development-only",
  });
}

function signature(workspaceId: string): string {
  return createHmac("sha256", secret()).update(`referral:${workspaceId}`).digest("base64url").slice(0, 24);
}

export function createReferralCode(workspaceId: string): string {
  return `${workspaceId}.${signature(workspaceId)}`;
}

export function parseReferralCode(code: string | undefined): string | null {
  if (!code || code.length > 220) return null;
  const separator = code.lastIndexOf(".");
  if (separator < 1) return null;
  const workspaceId = code.slice(0, separator);
  const supplied = code.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId)) return null;
  const expected = signature(workspaceId);
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right) ? workspaceId : null;
}
