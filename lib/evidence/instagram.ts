import "server-only";
import type { InstagramEvidenceSnapshot } from "@/lib/data/types";

const GRAPH = "https://graph.instagram.com";

export async function collectInstagramEvidence(
  accessToken: string | null,
  observedAt: string,
): Promise<InstagramEvidenceSnapshot> {
  const base: InstagramEvidenceSnapshot = { status: "not_connected", observedAt, media: [] };
  if (!accessToken) return base;
  try {
    const profile = await igGet<{
      id?: string; user_id?: string; username?: string; name?: string; biography?: string;
      website?: string; followers_count?: number;
    }>("/me", accessToken, "id,user_id,username,name,biography,website,followers_count");
    if (!profile.ok) return { ...base, status: profile.status, error: profile.error };
    const media = await igGet<{
      data?: Array<{ id?: string; caption?: string; media_type?: string; media_url?: string; permalink?: string; timestamp?: string }>;
    }>("/me/media", accessToken, "id,caption,media_type,media_url,permalink,timestamp");
    if (!media.ok) return { ...base, status: media.status, error: media.error };
    return {
      status: "synced",
      observedAt,
      accountId: profile.data.user_id ?? profile.data.id,
      username: profile.data.username,
      name: profile.data.name,
      biography: profile.data.biography,
      website: profile.data.website,
      followersCount: profile.data.followers_count,
      media: (media.data.data ?? []).flatMap((item) => item.id ? [{
        id: item.id,
        caption: item.caption,
        mediaType: item.media_type,
        mediaUrl: item.media_url,
        permalink: item.permalink,
        timestamp: item.timestamp,
      }] : []).slice(0, 100),
    };
  } catch (error) {
    return { ...base, status: "error", error: error instanceof Error ? error.message : "Instagram sync failed." };
  }
}

async function igGet<T>(path: string, token: string, fields: string): Promise<
  | { ok: true; data: T }
  | { ok: false; status: "not_authorized" | "error"; error: string }
> {
  const url = new URL(`${GRAPH}${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text().catch(() => "");
  if (!response.ok) return {
    ok: false,
    status: response.status === 400 || response.status === 401 || response.status === 403 ? "not_authorized" : "error",
    error: `Instagram API ${response.status}: ${text.slice(0, 180)}`,
  };
  return { ok: true, data: JSON.parse(text || "{}") as T };
}
