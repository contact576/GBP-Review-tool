import "server-only";
import { instagramAppId, instagramAppSecret } from "@/lib/google/config";

const AUTH = "https://www.instagram.com/oauth/authorize";
const TOKEN = "https://api.instagram.com/oauth/access_token";
const GRAPH = "https://graph.instagram.com";

export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_comments",
] as const;
export const INSTAGRAM_STATE_COOKIE = "ig_oauth_state";

export function buildInstagramAuthUrl(input: { redirectUri: string; state: string }): string {
  const url = new URL(AUTH);
  url.searchParams.set("client_id", instagramAppId());
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", input.state);
  url.searchParams.set("enable_fb_login", "0");
  url.searchParams.set("force_authentication", "1");
  return url.toString();
}

export async function exchangeInstagramCode(input: {
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string; accountId: string; expiresIn?: number; username?: string } | null> {
  const tokenResponse = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: instagramAppId(),
      client_secret: instagramAppSecret(),
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri,
      code: input.code,
    }),
    cache: "no-store",
  });
  if (!tokenResponse.ok) return null;
  const short = await tokenResponse.json() as { access_token?: string; user_id?: string | number };
  if (!short.access_token) return null;
  const longUrl = new URL(`${GRAPH}/access_token`);
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", instagramAppSecret());
  longUrl.searchParams.set("access_token", short.access_token);
  const longResponse = await fetch(longUrl, { cache: "no-store" });
  if (!longResponse.ok) return null;
  const long = await longResponse.json() as { access_token?: string; expires_in?: number };
  if (!long.access_token) return null;
  const profileUrl = new URL(`${GRAPH}/me`);
  profileUrl.searchParams.set("fields", "id,user_id,username");
  profileUrl.searchParams.set("access_token", long.access_token);
  const profileResponse = await fetch(profileUrl, { cache: "no-store" });
  const profile = profileResponse.ok
    ? await profileResponse.json() as { id?: string; user_id?: string; username?: string }
    : {};
  const accountId = profile.user_id ?? profile.id ?? String(short.user_id ?? "");
  if (!accountId) return null;
  return { accessToken: long.access_token, accountId, expiresIn: long.expires_in, username: profile.username };
}
