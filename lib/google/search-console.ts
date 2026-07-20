import "server-only";
import type { SearchConsoleEvidenceSnapshot } from "@/lib/data/types";

const API = "https://www.googleapis.com/webmasters/v3";

export async function collectSearchConsoleEvidence(input: {
  accessToken: string;
  websiteUrl?: string;
  observedAt: string;
  startDate: string;
  endDate: string;
  scopeGranted: boolean;
}): Promise<SearchConsoleEvidenceSnapshot> {
  const base: SearchConsoleEvidenceSnapshot = { status: "not_connected", observedAt: input.observedAt, rows: [] };
  if (!input.websiteUrl) return base;
  if (!input.scopeGranted) return { ...base, status: "not_authorized", error: "Reconnect Google with Search Console read access." };
  try {
    const sitesResponse = await googleFetch<{ siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }> }>(`${API}/sites`, input.accessToken);
    if (!sitesResponse.ok) return { ...base, status: sitesResponse.status, error: sitesResponse.error };
    const siteUrl = matchSearchConsoleProperty(input.websiteUrl, sitesResponse.data.siteEntry ?? []);
    if (!siteUrl) return { ...base, status: "unavailable", error: "No verified Search Console property matches the profile website." };
    const queryResponse = await googleFetch<{
      rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>;
    }>(`${API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, input.accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: input.startDate,
        endDate: input.endDate,
        dimensions: ["query", "page"],
        type: "web",
        dataState: "final",
        rowLimit: 250,
      }),
    });
    if (!queryResponse.ok) return { ...base, siteUrl, status: queryResponse.status, error: queryResponse.error };
    return {
      status: "synced",
      observedAt: input.observedAt,
      siteUrl,
      rows: (queryResponse.data.rows ?? []).flatMap((row) => row.keys?.[0] ? [{
        query: row.keys[0],
        page: row.keys[1],
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      }] : []),
    };
  } catch (error) {
    return { ...base, status: "error", error: error instanceof Error ? error.message : "Search Console sync failed." };
  }
}

export function matchSearchConsoleProperty(
  websiteUrl: string,
  entries: Array<{ siteUrl?: string; permissionLevel?: string }>,
): string | undefined {
  const website = new URL(websiteUrl);
  const host = website.hostname.replace(/^www\./, "").toLowerCase();
  const usable = entries.filter((entry) => entry.siteUrl && entry.permissionLevel !== "siteUnverifiedUser");
  return usable.find((entry) => entry.siteUrl === `sc-domain:${host}`)?.siteUrl
    ?? usable.find((entry) => {
      if (!entry.siteUrl || entry.siteUrl.startsWith("sc-domain:")) return false;
      try {
        const property = new URL(entry.siteUrl);
        return website.href.startsWith(property.href) || website.hostname === property.hostname;
      } catch { return false; }
    })?.siteUrl;
}

async function googleFetch<T>(url: string, token: string, init: RequestInit = {}): Promise<
  | { ok: true; data: T }
  | { ok: false; status: "not_authorized" | "error"; error: string }
> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const text = await response.text().catch(() => "");
  if (!response.ok) return {
    ok: false,
    status: response.status === 401 || response.status === 403 ? "not_authorized" : "error",
    error: `Search Console API ${response.status}: ${text.slice(0, 180)}`,
  };
  return { ok: true, data: JSON.parse(text || "{}") as T };
}
