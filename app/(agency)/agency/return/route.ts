import { NextResponse } from "next/server";
import { createSession, getSession } from "@/lib/auth/session";
import { appUrl } from "@/lib/utils/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Leave a client workspace and return to the agency console.
 *
 * The middleware sends an agency admin here whenever they navigate to /agency
 * while their session is still pointed at a client (see `agencyWorkspaceId`).
 * It restores the agency's own workspace on the session and redirects to
 * /agency. Idempotent: a session that is not inside a client is simply sent on.
 */
export async function GET() {
  const session = await getSession();
  const base = await appUrl();
  if (!session) return NextResponse.redirect(`${base}/sign-in?next=%2Fagency`);
  if (session.role === "agency_admin" && session.agencyWorkspaceId) {
    const { agencyWorkspaceId, ...rest } = session;
    await createSession({ ...rest, workspaceId: agencyWorkspaceId });
  }
  return NextResponse.redirect(`${base}/agency`);
}
