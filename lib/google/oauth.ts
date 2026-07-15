import "server-only";
import { randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { googleClientId, googleClientSecret } from "./config";

/**
 * Google OAuth 2.0 helpers (server-only).
 *
 * Two flows share this module:
 *  - Sign in with Google  → scopes "openid email profile", access_type=online
 *  - GBP connect          → scope business.manage, access_type=offline + consent
 *
 * CSRF: every authorization redirect carries a random `state` that is also
 * stored in a short-lived httpOnly cookie; the callback must present both.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

/** Name of the short-lived state cookie set before redirecting to Google. */
export const OAUTH_STATE_COOKIE = "g_oauth_state";
/** State cookie lifetime — long enough for the consent screen, no longer. */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

/** Random, URL-safe state value for the CSRF cookie + `state` param. */
export function makeStateCookie(): string {
  return randomBytes(24).toString("base64url");
}

export interface BuildAuthUrlInput {
  scopes: string[];
  redirectUri: string;
  state: string;
  accessType: "online" | "offline";
  prompt?: "consent" | "select_account" | "none";
  loginHint?: string;
  includeGrantedScopes?: boolean;
}

/** Authorization URL on accounts.google.com for the given flow. */
export function buildAuthUrl(input: BuildAuthUrlInput): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", googleClientId());
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("access_type", input.accessType);
  if (input.prompt) url.searchParams.set("prompt", input.prompt);
  if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
  if (input.includeGrantedScopes) url.searchParams.set("include_granted_scopes", "true");
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
}

/** Exchange an authorization code for tokens. Returns null on any failure. */
export async function exchangeCode(input: {
  code: string;
  redirectUri: string;
}): Promise<TokenResponse | null> {
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: input.code,
        client_id: googleClientId(),
        client_secret: googleClientSecret(),
        redirect_uri: input.redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<TokenResponse>;
    if (typeof data.access_token !== "string") return null;
    return {
      access_token: data.access_token,
      refresh_token: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
      id_token: typeof data.id_token === "string" ? data.id_token : undefined,
      expires_in: typeof data.expires_in === "number" ? data.expires_in : 3600,
    };
  } catch {
    return null;
  }
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

// Remote JWKS is cached by jose between calls within the same server process.
const googleJwks = createRemoteJWKSet(new URL(JWKS_URL));

/**
 * Verify a Google-issued ID token (signature via Google's JWKS, issuer,
 * audience) and extract the identity claims. Returns null when anything
 * fails verification — callers treat that as a failed sign-in.
 */
export async function decodeIdToken(idToken: string): Promise<GoogleIdentity | null> {
  try {
    const { payload } = await jwtVerify(idToken, googleJwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: googleClientId(),
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === "string" ? payload.name : "",
    };
  } catch {
    return null;
  }
}
