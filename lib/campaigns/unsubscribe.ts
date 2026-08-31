import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Unsubscribe links.
 *
 * `genericCampaignEmail` has always accepted an `unsubscribeUrl`, but nothing
 * ever produced one and no route ever honoured it — so every marketing email
 * the product could send was a CAN-SPAM violation (§7704(a)(3): a functioning
 * opt-out mechanism) and, in Canada, a CASL one.
 *
 * The token is a signed, self-describing payload rather than a database row so
 * the link keeps working with no session, no lookup table, and no expiry — an
 * opt-out link that has gone stale is the same as no opt-out link at all. It
 * carries no secret: worst case someone unsubscribes a customer who is already
 * entitled to be unsubscribed, which is the safe direction to fail.
 */

const PREFIX = "unsub:v1";

function signingSecret(): string {
  const configured =
    process.env.UNSUBSCRIBE_SIGNING_SECRET ||
    process.env.CONTENT_ASSET_SIGNING_SECRET ||
    process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production" && !configured) {
    throw new Error("AUTH_SECRET (or UNSUBSCRIBE_SIGNING_SECRET) is required in production.");
  }
  return configured || "foundly-unsubscribe-development-only";
}

export interface UnsubscribeClaims {
  workspaceId: string;
  customerId: string;
  /** Which campaign prompted the opt-out, for the audit trail. */
  campaignId?: string;
}

function payload(claims: UnsubscribeClaims): string {
  return [PREFIX, claims.workspaceId, claims.customerId, claims.campaignId ?? ""].join(":");
}

function sign(value: string): string {
  return createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function createUnsubscribeToken(claims: UnsubscribeClaims): string {
  if (!ID_RE.test(claims.workspaceId) || !ID_RE.test(claims.customerId)) {
    throw new Error("Invalid unsubscribe identity.");
  }
  if (claims.campaignId && !ID_RE.test(claims.campaignId)) {
    throw new Error("Invalid unsubscribe identity.");
  }
  const body = payload(claims);
  return `${Buffer.from(body, "utf8").toString("base64url")}.${sign(body)}`;
}

/** Verified claims, or null for anything tampered with or malformed. */
export function parseUnsubscribeToken(token: string): UnsubscribeClaims | null {
  if (typeof token !== "string" || token.length > 512) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const supplied = token.slice(dot + 1);

  let body: string;
  try {
    body = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  const parts = body.split(":");
  const [prefix, version, workspaceId, customerId, campaignId] = parts;
  if (`${prefix}:${version}` !== PREFIX) return null;
  if (!workspaceId || !customerId) return null;
  if (!ID_RE.test(workspaceId) || !ID_RE.test(customerId)) return null;
  return { workspaceId, customerId, campaignId: campaignId || undefined };
}

/** The absolute URL embedded in outbound marketing email. */
export function buildUnsubscribeUrl(baseUrl: string, claims: UnsubscribeClaims): string {
  const url = new URL("/api/unsubscribe", baseUrl);
  url.searchParams.set("t", createUnsubscribeToken(claims));
  return url.toString();
}
