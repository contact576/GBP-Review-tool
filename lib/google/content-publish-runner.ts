import "server-only";
import type { GoogleCredential } from "@/lib/data/provider";
import { decryptSecret } from "./crypto";
import { refreshAccessToken } from "./gbp";
import type { PreparedContentPublication } from "./content-publishing";

export interface ContentPublicationExecution {
  ok: boolean;
  verified: boolean;
  rejected?: boolean;
  providerResponse?: unknown;
  providerResourceName?: string;
  verifiedValue?: unknown;
  error?: string;
}

async function googleJson(
  endpoint: string,
  accessToken: string,
  init?: { method?: string; body?: Record<string, unknown> },
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const response = await fetch(endpoint, {
      method: init?.method || "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const error = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : {};
      const status = typeof error.status === "string" ? error.status : `HTTP ${response.status}`;
      return { ok: false, error: `Google rejected this publication (${status}).` };
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Google publication request failed." };
  }
}

export async function executeContentPublication(
  plan: PreparedContentPublication,
  credential: GoogleCredential | null,
): Promise<ContentPublicationExecution> {
  if (!credential) return { ok: false, verified: false, error: "Google Business Profile is not connected." };
  const refreshToken = decryptSecret(credential.encryptedRefreshToken);
  if (!refreshToken) return { ok: false, verified: false, error: "Stored Google credential could not be read; reconnect Google." };
  const token = await refreshAccessToken(refreshToken);
  if (!token.ok) return { ok: false, verified: false, error: token.detail };

  const written = await googleJson(plan.endpoint, token.data.accessToken, { method: plan.method, body: plan.body });
  if (!written.ok) return { ok: false, verified: false, error: written.error };

  if (plan.kind === "local_post") {
    const name = typeof written.data.name === "string" ? written.data.name : "";
    if (!/^accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+\/localPosts\/[A-Za-z0-9_-]+$/.test(name)) {
      return { ok: true, verified: false, providerResponse: written.data, error: "Google returned no local-post resource to verify." };
    }
    const readBack = await googleJson(`https://mybusiness.googleapis.com/v4/${name}`, token.data.accessToken);
    if (!readBack.ok) {
      return { ok: true, verified: false, providerResponse: written.data, providerResourceName: name, error: readBack.error };
    }
    const state = typeof readBack.data.state === "string" ? readBack.data.state : "PROCESSING";
    const summary = typeof readBack.data.summary === "string" ? readBack.data.summary.trim() : "";
    if (state === "REJECTED") {
      return { ok: false, verified: false, rejected: true, providerResponse: written.data, providerResourceName: name, verifiedValue: readBack.data, error: "Google rejected the local post during processing." };
    }
    return {
      ok: true,
      verified: state === "LIVE" && summary === plan.expectedValue,
      providerResponse: written.data,
      providerResourceName: name,
      verifiedValue: readBack.data,
      ...(state !== "LIVE" ? { error: `Google accepted the post and reports ${state.toLowerCase()} status.` } : {}),
    };
  }

  if (plan.kind === "owner_reply") {
    const readBack = await googleJson(plan.verificationEndpoint, token.data.accessToken);
    if (!readBack.ok) return { ok: true, verified: false, providerResponse: written.data, error: readBack.error };
    const reply = readBack.data.reviewReply && typeof readBack.data.reviewReply === "object"
      ? readBack.data.reviewReply as Record<string, unknown>
      : {};
    const comment = typeof reply.comment === "string" ? reply.comment.trim() : "";
    return { ok: true, verified: comment === plan.expectedValue, providerResponse: written.data, verifiedValue: comment };
  }

  const readBack = await googleJson(plan.verificationEndpoint, token.data.accessToken);
  if (!readBack.ok) return { ok: true, verified: false, providerResponse: written.data, error: readBack.error };
  const answers = Array.isArray(readBack.data.answers) ? readBack.data.answers : [];
  const match = answers.find((answer) => answer && typeof answer === "object" && (answer as Record<string, unknown>).text === plan.expectedValue);
  return { ok: true, verified: Boolean(match), providerResponse: written.data, verifiedValue: match ?? readBack.data };
}
