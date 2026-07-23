import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveSecret } from "@/lib/security/secret";

const ASSET_ID_RE = /^asset_[a-f0-9]{24}$/;
const WORKSPACE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function signingSecret(): string {
  return resolveSecret({
    value: process.env.CONTENT_ASSET_SIGNING_SECRET || process.env.AUTH_SECRET,
    name: "CONTENT_ASSET_SIGNING_SECRET (or AUTH_SECRET)",
    devFallback: "foundly-content-asset-development-only",
  });
}

function payload(workspaceId: string, assetId: string, expiresAt: number): string {
  return `content-asset:v1:${workspaceId}:${assetId}:${expiresAt}`;
}

function signature(workspaceId: string, assetId: string, expiresAt: number): string {
  return createHmac("sha256", signingSecret())
    .update(payload(workspaceId, assetId, expiresAt))
    .digest("base64url");
}

/** Create a Google-fetchable URL without exposing the tenant or the rest of Foundly. */
export function createSignedContentAssetUrl(input: {
  baseUrl: string;
  workspaceId: string;
  assetId: string;
  expiresAt: number;
}): string {
  if (!WORKSPACE_ID_RE.test(input.workspaceId) || !ASSET_ID_RE.test(input.assetId)) {
    throw new Error("Invalid content asset identity.");
  }
  const url = new URL(`/api/public/content-assets/${input.assetId}`, input.baseUrl);
  if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Local-post publishing requires a public HTTPS APP_URL so Google can fetch the approved image.");
  }
  url.searchParams.set("workspace", input.workspaceId);
  url.searchParams.set("expires", String(input.expiresAt));
  url.searchParams.set("signature", signature(input.workspaceId, input.assetId, input.expiresAt));
  return url.toString();
}

export function verifySignedContentAsset(input: {
  workspaceId: string;
  assetId: string;
  expiresAt: number;
  suppliedSignature: string;
  now?: number;
}): boolean {
  if (!WORKSPACE_ID_RE.test(input.workspaceId) || !ASSET_ID_RE.test(input.assetId)) return false;
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= (input.now ?? Date.now())) return false;
  if (input.expiresAt > (input.now ?? Date.now()) + 48 * 60 * 60_000) return false;
  const expected = signature(input.workspaceId, input.assetId, input.expiresAt);
  const left = Buffer.from(expected);
  const right = Buffer.from(input.suppliedSignature);
  return left.length === right.length && timingSafeEqual(left, right);
}
