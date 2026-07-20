import { type NextRequest, NextResponse } from "next/server";
import { getRealProvider } from "@/lib/data";
import { validateTwilioSignature } from "@/lib/sms/twilio";
import { appUrl } from "@/lib/utils/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STOP = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);

function twiml(message?: string): Response {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(body, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

export async function POST(req: NextRequest): Promise<Response> {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const base = (await appUrl()).replace(/\/$/, "");
  const signedUrl = `${base}${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (!validateTwilioSignature(signedUrl, params, req.headers.get("x-twilio-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  const keyword = (params.get("Body") ?? "").trim().toUpperCase();
  const from = params.get("From") ?? "";
  if (STOP.has(keyword) && from) {
    const provider = await getRealProvider();
    await provider.suppressPhoneGlobally(from, `SMS opt-out keyword: ${keyword}`);
    return twiml("You are unsubscribed and will receive no more Foundly messages. Reply START only after giving the business permission again.");
  }
  if (keyword === "HELP" || keyword === "INFO") {
    return twiml("Foundly sends review requests for businesses you visited. Reply STOP to opt out. Contact the business for help.");
  }
  return twiml();
}
