import { type NextRequest, NextResponse } from "next/server";
import { getRealProvider } from "@/lib/data";
import { validateTwilioSignature } from "@/lib/sms/twilio";
import { appUrl } from "@/lib/utils/app-url";
import { applyCampaignDeliveryReceipt } from "@/lib/campaigns/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Twilio status callbacks for CAMPAIGN messages.
 *
 * Separate from the review-request callback because the two write to different
 * records: that one advances a `ReviewRequest`, this one patches one recipient
 * inside a campaign's frozen snapshot. Pointing campaign traffic at the request
 * endpoint would either 400 or corrupt request state.
 *
 * Why it matters: a synchronous send only proves Twilio ACCEPTED the message.
 * Undeliverable numbers come back minutes later, so without this the campaign's
 * "sent" count would stay optimistically wrong forever.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const base = (await appUrl()).replace(/\/$/, "");
  const signedUrl = `${base}${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (!validateTwilioSignature(signedUrl, params, req.headers.get("x-twilio-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  const workspaceId = req.nextUrl.searchParams.get("workspaceId") ?? "";
  const campaignId = req.nextUrl.searchParams.get("campaignId") ?? "";
  const messageSid = params.get("MessageSid") ?? params.get("SmsSid") ?? "";
  const ID_RE = /^[A-Za-z0-9_-]{1,160}$/;
  if (!ID_RE.test(workspaceId) || !ID_RE.test(campaignId) || !ID_RE.test(messageSid)) {
    return NextResponse.json({ error: "invalid request scope" }, { status: 400 });
  }

  const twilioStatus = (params.get("MessageStatus") ?? "").toLowerCase();
  const outcome =
    twilioStatus === "delivered" || twilioStatus === "read"
      ? ("sent" as const)
      : ["failed", "undelivered", "canceled"].includes(twilioStatus)
        ? ("failed" as const)
        : null;
  // In-flight states (queued/sending/sent) carry no new information — the
  // recipient is already recorded as sent.
  if (!outcome) return new Response(null, { status: 204 });

  await applyCampaignDeliveryReceipt({
    provider: await getRealProvider(),
    workspaceId,
    campaignId,
    providerId: messageSid,
    outcome,
    detail:
      outcome === "failed"
        ? `Twilio could not deliver this message (${params.get("ErrorCode") ?? "no error code"}).`
        : undefined,
  });
  return new Response(null, { status: 204 });
}
