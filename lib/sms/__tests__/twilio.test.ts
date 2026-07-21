import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { validateTwilioSignature } from "@/lib/sms/twilio";
import { canonicalPhone, isE164 } from "@/lib/sms/phone";

const original = process.env.TWILIO_AUTH_TOKEN;

afterEach(() => {
  if (original === undefined) delete process.env.TWILIO_AUTH_TOKEN;
  else process.env.TWILIO_AUTH_TOKEN = original;
});

describe("Twilio messaging security", () => {
  it("validates the exact callback URL and sorted form fields", () => {
    process.env.TWILIO_AUTH_TOKEN = "auth-token";
    const url = "https://foundly.example/api/webhooks/twilio/status?workspaceId=ws_1&requestId=req_1";
    const params = new URLSearchParams({ MessageStatus: "delivered", MessageSid: "SM123" });
    const payload = `${url}MessageSidSM123MessageStatusdelivered`;
    const signature = createHmac("sha1", "auth-token").update(payload).digest("base64");
    expect(validateTwilioSignature(url, params, signature)).toBe(true);
    expect(validateTwilioSignature(`${url}x`, params, signature)).toBe(false);
  });

  it("normalizes display formatting but only sends valid E.164 numbers", () => {
    expect(canonicalPhone("+1 (415) 555-0123")).toBe("+14155550123");
    expect(isE164("+1 (415) 555-0123")).toBe(true);
    expect(isE164("415-555-0123")).toBe(false);
  });
});
