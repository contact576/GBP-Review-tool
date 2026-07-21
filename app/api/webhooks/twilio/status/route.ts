import { type NextRequest, NextResponse } from "next/server";
import { getRealProvider } from "@/lib/data";
import { validateTwilioSignature } from "@/lib/sms/twilio";
import { appUrl } from "@/lib/utils/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const base = (await appUrl()).replace(/\/$/, "");
  const signedUrl = `${base}${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (!validateTwilioSignature(signedUrl, params, req.headers.get("x-twilio-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  const workspaceId = req.nextUrl.searchParams.get("workspaceId") ?? "";
  const requestId = req.nextUrl.searchParams.get("requestId") ?? "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId) || !/^[A-Za-z0-9_-]{1,160}$/.test(requestId)) {
    return NextResponse.json({ error: "invalid request scope" }, { status: 400 });
  }

  const twilioStatus = (params.get("MessageStatus") ?? "").toLowerCase();
  const status =
    twilioStatus === "delivered" || twilioStatus === "read"
      ? "delivered"
      : ["failed", "undelivered", "canceled"].includes(twilioStatus)
        ? "failed"
        : ["accepted", "queued", "sending", "sent"].includes(twilioStatus)
          ? "sent"
          : null;
  if (status) {
    const provider = await getRealProvider();
    await provider.setRequestDeliveryStatus(
      workspaceId,
      requestId,
      status,
      status === "failed" ? `Twilio delivery failed (${params.get("ErrorCode") ?? "unknown"}).` : undefined,
    );
  }
  return new Response(null, { status: 204 });
}
