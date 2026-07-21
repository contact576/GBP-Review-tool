import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getProviderFor } from "@/lib/data";
import { instagramOAuthEnabled } from "@/lib/google/config";
import { encryptSecret } from "@/lib/google/crypto";
import { exchangeInstagramCode, INSTAGRAM_SCOPES, INSTAGRAM_STATE_COOKIE } from "@/lib/evidence/instagram-oauth";
import { appUrl } from "@/lib/utils/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const origin = await appUrl();
  const finish = (query = "") => {
    const response = NextResponse.redirect(new URL(`/app/settings/integrations${query}`, origin));
    response.cookies.delete(INSTAGRAM_STATE_COOKIE);
    return response;
  };
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/sign-in", origin));
  if (session.role !== "owner" && session.role !== "manager") return finish("?error=forbidden");
  if (!instagramOAuthEnabled()) return finish("?error=instagram_not_configured");
  if (request.nextUrl.searchParams.get("error")) return finish("?error=instagram_cancelled");
  const code = request.nextUrl.searchParams.get("code")?.replace(/#_$/, "");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = request.cookies.get(INSTAGRAM_STATE_COOKIE)?.value;
  if (!code || !state || !cookieState || state !== cookieState) return finish("?error=instagram_state");
  const provider = await getProviderFor(session);
  const credential = await exchangeInstagramCode({ code, redirectUri: `${origin}/api/instagram/connect/callback` });
  if (!credential) {
    await provider.setIntegrationStatus(session.workspaceId, "instagram", "needs_attention", "Instagram authorization could not be completed. Confirm the app permissions and reconnect.");
    return finish("?error=instagram_exchange");
  }
  const expiresAt = credential.expiresIn
    ? new Date(Date.now() + credential.expiresIn * 1000).toISOString()
    : undefined;
  await provider.saveInstagramCredential(session.workspaceId, {
    encryptedAccessToken: encryptSecret(credential.accessToken),
    accountId: credential.accountId,
    username: credential.username,
    scopes: INSTAGRAM_SCOPES.join(" "),
    expiresAt,
  });
  await provider.setIntegrationStatus(session.workspaceId, "instagram", "connected", `Authorized Instagram account${credential.username ? ` @${credential.username}` : ""}; evidence syncs with Google.`);
  await provider.syncGoogleProfile(session.workspaceId);
  return finish("?connected=instagram");
}
