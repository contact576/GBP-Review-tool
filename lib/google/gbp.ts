import "server-only";
import { googleClientId, googleClientSecret } from "./config";

/**
 * Google Business Profile APIs — typed, approval-aware client (server-only).
 *
 * IMPORTANT — GBP API access is gated by Google, per project:
 *  1. Enable "My Business Account Management API" and "My Business Business
 *     Information API" in the Google Cloud console for your project.
 *  2. Request GBP API access for the project — prerequisites:
 *     https://developers.google.com/my-business/content/prereqs
 *     application form:
 *     https://support.google.com/business/contact/api_default
 *  Approval is granted per-project and typically takes 1–2 weeks. Until then,
 *  calls fail with 403s that this module classifies as `not_approved` so the
 *  UI can tell the truth instead of pretending the connection works.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ACCOUNTS_ENDPOINT = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";

export type GbpResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "not_approved" | "unauthorized" | "error"; detail: string };

export interface GbpAccount {
  /** Resource name, e.g. "accounts/1234567890". */
  name: string;
  accountName?: string;
  type?: string;
  verificationState?: string;
}

export interface GbpLocation {
  /** Resource name, e.g. "locations/1234567890". */
  name: string;
  title?: string;
  storefrontAddress?: {
    addressLines?: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    regionCode?: string;
  };
  metadata?: {
    placeId?: string;
    mapsUri?: string;
    newReviewUri?: string;
  };
}

/** Mint a fresh access token from a stored (decrypted) refresh token. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<GbpResult<{ accessToken: string; expiresIn: number }>> {
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: googleClientId(),
        client_secret: googleClientSecret(),
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) {
      if (res.status === 400 || res.status === 401) {
        return {
          ok: false,
          reason: "unauthorized",
          detail: "Refresh token was revoked or expired — reconnect Google.",
        };
      }
      return { ok: false, reason: "error", detail: `Token refresh ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = JSON.parse(body) as { access_token?: string; expires_in?: number };
    if (typeof data.access_token !== "string") {
      return { ok: false, reason: "error", detail: "Token refresh returned no access_token." };
    }
    return {
      ok: true,
      data: { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 },
    };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message : "Network error refreshing token",
    };
  }
}

/** List GBP accounts the connected Google user can manage. */
export async function listAccounts(accessToken: string): Promise<GbpResult<GbpAccount[]>> {
  return gbpGet<{ accounts?: GbpAccount[] }, GbpAccount[]>(
    ACCOUNTS_ENDPOINT,
    accessToken,
    (body) => body.accounts ?? [],
  );
}

/**
 * List locations under an account (resource name like "accounts/123").
 * readMask keeps the payload small: name, title, address, metadata.
 */
export async function listLocations(
  accessToken: string,
  account: string,
): Promise<GbpResult<GbpLocation[]>> {
  const url = `${INFO_BASE}/${account}/locations?readMask=${encodeURIComponent(
    "name,title,storefrontAddress,metadata",
  )}`;
  return gbpGet<{ locations?: GbpLocation[] }, GbpLocation[]>(
    url,
    accessToken,
    (body) => body.locations ?? [],
  );
}

// ── Shared fetch + approval-aware error classification ─────────────────────

async function gbpGet<Body, T>(
  url: string,
  accessToken: string,
  pick: (body: Body) => T,
): Promise<GbpResult<T>> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) return classifyError(res.status, text);
    const body = JSON.parse(text || "{}") as Body;
    return { ok: true, data: pick(body) };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message : "Network error reaching GBP API",
    };
  }
}

/**
 * 403s from a project that hasn't been approved for the GBP APIs come back
 * as SERVICE_DISABLED / accessNotConfigured / "has not been used in project"
 * — surface those as `not_approved` (an expected, honest waiting state),
 * not as a generic failure.
 */
function classifyError(status: number, body: string): GbpResult<never> {
  const snippet = body.slice(0, 300);
  if (status === 401) {
    return { ok: false, reason: "unauthorized", detail: "Access token expired or invalid." };
  }
  if (status === 403) {
    const lower = body.toLowerCase();
    if (
      lower.includes("has not been used in project") ||
      lower.includes("disabled") ||
      lower.includes("service_disabled") ||
      lower.includes("accessnotconfigured")
    ) {
      return {
        ok: false,
        reason: "not_approved",
        detail:
          "GBP API not enabled/approved for this Google Cloud project yet. " +
          "Enable the My Business APIs and request access: " +
          "https://developers.google.com/my-business/content/prereqs",
      };
    }
    return { ok: false, reason: "unauthorized", detail: `403 from GBP API: ${snippet}` };
  }
  return { ok: false, reason: "error", detail: `GBP API ${status}: ${snippet}` };
}
